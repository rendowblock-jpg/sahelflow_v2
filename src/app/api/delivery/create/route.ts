import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDeliveryAdapter, loadDeliveryCredentials } from "@/lib/integrations/delivery";
import { db } from "@/lib/db";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { assertCanTransition } from "@/lib/order-transitions";
import { recordOrderChange } from "@/lib/data/order-change-service";
import { dispatchTrigger } from "@/lib/automations/engine";
import type { OrderStatus } from "@/types/domain";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  orderId: z.string().min(1),
  provider: z.enum(["yalidine", "maystro", "zrexpress", "dhd"]),
});

/**
 * POST /api/delivery/create — create a shipment with the delivery provider.
 *
 * Reads the order + customer from the DB, calls the provider's API, and
 * updates the Delivery record with the tracking number + cost.
 *
 * B4b (shipment idempotency): BEFORE calling the adapter, we check for an
 * existing Delivery row with a non-null trackingNumber. If one exists, we
 * return 409 immediately. This prevents two double-shipment paths:
 *   1. Double-click on "Create shipment" — the second request sees the row
 *      inserted by the first and bails with 409.
 *   2. Retry after partial failure where the FIRST attempt succeeded at the
 *      provider AND committed the Delivery row, then a later step failed —
 *      the retry sees the existing row and bails with 409.
 * The recovery path (order.status === "shipped" but NO Delivery row — a data
 * inconsistency) is still allowed through: in that case there is no parcel to
 * orphan, so we let the adapter run. The transaction's delivery.upsert below
 * is the second line of defense: by the time it runs, our pre-check has
 * guaranteed that any pre-existing Delivery row for this orderId has a NULL
 * trackingNumber (so the update branch cannot overwrite a real trackingNumber).
 */
export const POST = withErrorHandler(async (req: NextRequest) => {
  await requireAuth();
  const body = await req.json();
  const input = createSchema.parse(body);

  // Fetch the order + customer
  const order = await db.order.findUnique({
    where: { id: input.orderId },
    include: {
      customer: true,
      items: true,
    },
  });

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  if (order.status !== "confirmed" && order.status !== "shipped") {
    return NextResponse.json(
      { error: `Order must be confirmed before shipping avant l'expédition (statut actuel: ${order.status})` },
      { status: 400 },
    );
  }

  // B4b: idempotency gate — refuse to create a second shipment for an order
  // that already has a Delivery row with a trackingNumber. See the file-level
  // comment for the full rationale. Checked BEFORE the adapter call so we
  // never even touch the provider API when a shipment already exists.
  const existingDelivery = await db.delivery.findFirst({
    where: { orderId: order.id, trackingNumber: { not: null } },
  });
  if (existingDelivery) {
    return NextResponse.json(
      {
        error: "Shipment already exists for this order",
        trackingNumber: existingDelivery.trackingNumber,
      },
      { status: 409 },
    );
  }

  const adapter = getDeliveryAdapter(input.provider);
  const creds = await loadDeliveryCredentials(input.provider);

  const result = await adapter.createShipment(
    {
      orderId: order.id,
      orderNumber: order.orderNumber,
      customer: {
        name: order.customer.name,
        phone: order.customer.phone,
        wilaya: order.wilaya,
        commune: order.commune,
        address: order.address,
      },
      items: order.items.map((i) => ({
        name: i.productName,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
      })),
      totalPrice: order.totalPrice,
      weight: Math.max(1, order.items.reduce((sum, i) => sum + i.quantity, 0)), // Estimate: 1kg per unit, minimum 1kg
      notes: order.notes ?? undefined,
    },
    creds,
  );

  if (!result.success) {
    return NextResponse.json(
      { error: result.error ?? "Failed to create shipment" },
      { status: 502 },
    );
  }

  // Create/update the Delivery record + update order status in a transaction.
  // Session 30 (AUDIT-2 A3): the entire create-shipment flow is now atomic.
  // Previously the order status update happened OUTSIDE the $transaction,
  // so a failure there left a delivery record at the provider with no matching
  // order state in our DB. Now: delivery upsert + order status update + ledger
  // entry all happen inside the same tx. If any step fails, the whole thing
  // rolls back.
  const [delivery] = await db.$transaction(async (tx) => {
    const d = await tx.delivery.upsert({
      where: { orderId: order.id },
      create: {
        orderId: order.id,
        provider: input.provider,
        trackingNumber: result.trackingId,
        cost: result.cost,
        status: "created",
        estimatedDelivery: result.estimatedDelivery
          ? new Date(result.estimatedDelivery)
          : null,
      },
      update: {
        provider: input.provider,
        trackingNumber: result.trackingId,
        cost: result.cost,
        status: "created",
        estimatedDelivery: result.estimatedDelivery
          ? new Date(result.estimatedDelivery)
          : null,
      },
    });

    // Update order status inside the tx (enforce state machine manually
    // since we can't call orderService.updateStatus which opens its own tx)
    const fresh = await tx.order.findFirst({ where: { id: order.id, deletedAt: null }, select: { status: true } });
    if (fresh) {
      const from = fresh.status as OrderStatus;
      const to: OrderStatus = "shipped";
      if (from !== to) {
        assertCanTransition(from, to);
        await tx.order.update({
          where: { id: order.id },
          data: { status: to, shippedAt: new Date() },
        });
        // Record ledger entry — same tx (S2 fix)
        await recordOrderChange({
          orderId: order.id,
          actionType: "status_change",
          actor: "user",
          payload: { from, to, reason: "delivery_create" },
          tx,
        });
      }
    }

    return [d];
  });

  // Phase 1 bug 1.4: fire order.shipped trigger (fire-and-forget) AFTER the tx
  // commits — so "ship → WhatsApp notify" automations fire when a shipment is
  // created via this route (the most common shipment path). Previously only the
  // AI create_shipment tool fired this trigger, so API/UI shipments silently
  // skipped automations. orderService.updateStatus does the same after its tx.
  void dispatchTrigger("order.shipped", {
    orderId: order.id,
    orderNumber: order.orderNumber,
    customerId: order.customerId,
    totalPrice: order.totalPrice,
    wilaya: order.wilaya,
    phone: order.phone,
  });

  return NextResponse.json({
    ok: true,
    delivery,
    labelUrl: result.labelUrl,
  });
}, "POST /api/delivery/create");
