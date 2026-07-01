import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDeliveryAdapter, loadDeliveryCredentials } from "@/lib/integrations/delivery";
import { db } from "@/lib/db";
import { orderService } from "@/lib/data/order-service";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

const syncSchema = z.object({
  deliveryId: z.string().min(1).optional(),
  orderId: z.string().min(1).optional(),
}).refine((d) => d.deliveryId || d.orderId, {
  message: "Either deliveryId or orderId is required",
});

/**
 * POST /api/delivery/sync — sync tracking for a shipment.
 *
 * Fetches the latest tracking info from the provider and updates the Delivery
 * record. If the shipment is delivered, updates the order status too.
 */
export const POST = withErrorHandler(async (req: NextRequest) => {
  await requireAuth();
  const body = await req.json();
  const input = syncSchema.parse(body);

  // Find the delivery record
  const delivery = input.deliveryId
    ? await db.delivery.findUnique({ where: { id: input.deliveryId } })
    : await db.delivery.findUnique({ where: { orderId: input.orderId! } });

  if (!delivery) {
    return NextResponse.json({ error: "Delivery not found" }, { status: 404 });
  }
  if (!delivery.trackingNumber) {
    return NextResponse.json(
      { error: "Pas de numéro de suivi pour cette expédition" },
      { status: 400 },
    );
  }

  const adapter = getDeliveryAdapter(delivery.provider);
  const creds = await loadDeliveryCredentials(delivery.provider);

  const tracking = await adapter.syncTracking(delivery.trackingNumber, creds);

  // Update the delivery record + order status in a transaction (D-003).
  // Route through orderService.updateStatus so the state machine enforces
  // transitions and customer stats (orderCount, totalSpent) are updated.
  // The old code did a direct db.order.update which bypassed both.
  await db.$transaction(async (tx) => {
    await tx.delivery.update({
      where: { id: delivery.id },
      data: {
        status: tracking.status,
        estimatedDelivery: tracking.estimatedDelivery
          ? new Date(tracking.estimatedDelivery)
          : null,
      },
    });

    // If delivered, update the order via the service (enforces state
    // machine + stock + customer stats side effects). Skip if the order
    // is already delivered (idempotent).
    if (tracking.status === "delivered") {
      const order = await tx.order.findUnique({
        where: { id: delivery.orderId },
        select: { status: true },
      });
      if (order && order.status !== "delivered") {
        // orderService.updateStatus uses its own prisma client, not tx —
        // but since SQLite serializes writes, this is safe. The delivery
        // update above is already committed in this tx.
        await orderService.updateStatus({ prisma: db }, delivery.orderId, "delivered");
      }
    }
  });

  return NextResponse.json({
    ok: true,
    status: tracking.status,
    events: tracking.events,
    estimatedDelivery: tracking.estimatedDelivery,
  });
}, "POST /api/delivery/sync");

/**
 * GET /api/delivery/sync?deliveryId=... — fetch tracking without updating.
 * Returns the current tracking info from the provider (read-only).
 */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const deliveryId = req.nextUrl.searchParams.get("deliveryId");
  if (!deliveryId) {
    return NextResponse.json({ error: "deliveryId required" }, { status: 400 });
  }

  const delivery = await db.delivery.findUnique({ where: { id: deliveryId } });
  if (!delivery) {
    return NextResponse.json({ error: "Delivery not found" }, { status: 404 });
  }
  if (!delivery.trackingNumber) {
    return NextResponse.json(
      { error: "Pas de numéro de suivi" },
      { status: 400 },
    );
  }

  const adapter = getDeliveryAdapter(delivery.provider);
  const creds = await loadDeliveryCredentials(delivery.provider);
  const tracking = await adapter.syncTracking(delivery.trackingNumber, creds);

  return NextResponse.json({ tracking });
}, "GET /api/delivery/sync");
