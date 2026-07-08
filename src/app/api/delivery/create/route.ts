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
