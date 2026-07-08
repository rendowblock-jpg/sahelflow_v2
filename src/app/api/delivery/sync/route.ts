import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDeliveryAdapter, loadDeliveryCredentials } from "@/lib/integrations/delivery";
import { db } from "@/lib/db";
import { orderService } from "@/lib/data/order-service";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { logger } from "@/lib/logger";

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
  //
  // Phase 7 (discovered by integration test delivery.test.ts): the
  // orderService.updateStatus call MUST run AFTER the delivery-update tx
  // commits, NOT inside it. The service opens its own $transaction; calling
  // it from inside this $transaction deadlocks on SQLite (the outer tx
  // holds the write lock, the inner tx waits for it forever → socket
  // timeout). Same pattern as the Phase 1 bug 1.2 fix in
  // /api/delivery/[id]/route.ts. The delivery update stays in the tx (F-H5:
  // delivery + order transition stay consistent — the order transition now
  // runs AFTER the tx commits via orderService.updateStatus, which opens its
  // own tx; SQLite serializes writes so this is safe).
  let shouldTransitionToDelivered = false;
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

    // If delivered, flag for the post-tx order transition. Skip if the
    // order is already delivered (idempotent).
    if (tracking.status === "delivered") {
      const order = await tx.order.findUnique({
        where: { id: delivery.orderId },
        select: { status: true },
      });
      if (order && order.status !== "delivered") {
        shouldTransitionToDelivered = true;
      }
    }
  });

  // After the tx commits: route the order transition through the canonical
  // service so all side effects (deliveredAt, customer stats, ledger,
  // automation trigger) fire. Wrapped in try/catch — if the transition is
  // invalid (e.g. order already terminal), we don't want to 500 the
  // delivery update that already committed.
  if (shouldTransitionToDelivered) {
    try {
      await orderService.updateStatus({ prisma: db }, delivery.orderId, "delivered");
    } catch (err) {
      logger.warn("delivery/sync: order status transition skipped", {
        orderId: delivery.orderId,
        error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      });
    }
  }

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
