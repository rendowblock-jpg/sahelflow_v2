/**
 * PATCH /api/delivery/[id] — manually update delivery status.
 *
 * Useful for offline providers or correcting sync errors.
 * Body: { status: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, shopContext } from "@/lib/db";
import { deliveryService } from "@/lib/data/delivery-service";
import { orderService } from "@/lib/data/order-service";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { logger } from "@/lib/logger";
import type { OrderStatus } from "@/types/domain";

export const dynamic = "force-dynamic";

const VALID_STATUSES = [
  "pending", "created", "picked_up", "in_transit", "at_hub",
  "out_for_delivery", "delivered", "returned", "refused", "failed"
];

const updateSchema = z.object({
  status: z.enum(VALID_STATUSES as [string, ...string[]]),
});

type RouteContext = { params: Promise<{ id: string }> };

export const PATCH = withErrorHandler(async (req: NextRequest, { params }: RouteContext) => {
  await requireAuth();
  const { id } = await params;
  const { status } = updateSchema.parse(await req.json());
  const context = { prisma: db, shop: shopContext };

  // Route the lookup through the service so the soft-delete filter
  // (deletedAt: null) is applied. The previous direct `findUnique` would
  // happily operate on a soft-deleted delivery. NotFoundError → 404 via
  // withErrorHandler.
  const existing = await deliveryService.getById(context, id);

  // Phase 1 bug 1.2: route the order status transition through the canonical
  // orderService.updateStatus (single source of truth) instead of inlining
  // the state machine + stock + ledger here. The previous inline block:
  //   - never set order.deliveredAt
  //   - never incremented customer.orderCount / totalSpent
  //   - never fired the order.delivered / order.returned automation triggers
  //   - recorded the OrderChange ledger with the wrong `status` field
  //     (literally the string "confirmed" regardless of the target status)
  // The delivery.update stays in the tx (F-H5: delivery + order transition
  // stay consistent — the order transition now runs AFTER the tx commits
  // via orderService.updateStatus, which opens its own tx; SQLite serializes
  // writes so this is safe, same pattern as /api/delivery/sync).
  const targetOrderStatus: OrderStatus | null =
    status === "delivered" ? "delivered" :
    status === "returned" ? "returned" :
    status === "refused" ? "refused" : null;
  const orderId = existing.orderId;

  const updated = await context.prisma.$transaction(async (tx) => {
    const delivery = await tx.delivery.update({
      where: { id },
      data: { status },
    });
    return delivery;
  });

  // After the tx commits: route the order transition through the canonical
  // service so all side effects (deliveredAt, customer stats, stock, ledger,
  // automation trigger) fire. Wrap in try/catch — if the transition is
  // invalid (e.g. order already in a terminal state, or the delivery status
  // doesn't map to a legal order transition right now), we don't want to 500
  // the delivery update that already committed.
  if (orderId && targetOrderStatus) {
    try {
      await orderService.updateStatus({ prisma: db, shop: shopContext }, orderId, targetOrderStatus, { actor: "system" });
    } catch (err) {
      logger.warn("delivery/[id] PATCH: order status transition skipped", {
        orderId,
        target: targetOrderStatus,
        error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      });
    }
  }

  return NextResponse.json({ delivery: updated });
}, "PATCH /api/delivery/[id]");
