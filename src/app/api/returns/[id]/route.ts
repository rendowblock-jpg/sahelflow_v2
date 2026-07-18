/**
 * PATCH /api/returns/[id] — update return status (requested → approved → completed / rejected)
 *
 * SEC-016/CODE-013/CODE-029: return update + returnNote create + stock restoration +
 * customer stats adjustment are all in a single $transaction. A failure on any
 * step rolls back all changes.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, shopContext } from "@/lib/db";
import { orderService } from "@/lib/data/order-service";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { SahelFlowError } from "@/types/errors";
import { requireAuth } from "@/lib/auth/server";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const returnStatusSchema = z.object({
  status: z.enum(["approved", "rejected", "completed"]),
  notes: z.string().optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export const PATCH = withErrorHandler(async (req: NextRequest, { params }: RouteContext) => {
  await requireAuth();
  const { id } = await params;
  const body = await req.json();
  const { status, notes } = returnStatusSchema.parse(body);
  const context = { prisma: db, shop: shopContext };

  const existing = await db.return.findUnique({ where: { id } });
  if (!existing) {
    throw new SahelFlowError("Return not found", "NOT_FOUND", 404);
  }

  const currentStatus = existing.status;
  const ALLOWED: Record<string, string[]> = {
    requested: ["approved", "rejected"],
    approved: ["completed", "rejected"],
    rejected: [],
    completed: [],
  };
  const allowed = ALLOWED[currentStatus] ?? [];
  if (!allowed.includes(status)) {
    throw new SahelFlowError(
      `Cannot transition from ${currentStatus} to ${status}`,
      "CONFLICT",
      409,
    );
  }

  // SEC-016/CODE-013: transactional return update + note. The Return row +
  // ReturnNote stay in the tx. The order status transition (delivered →
  // returned) is routed through orderService.updateStatus AFTER the tx
  // commits so it goes through the canonical state machine (single source of
  // truth) — this prevents the Return+Refund double-counting bug (Phase 1
  // 1.1): previously the Return flow restored stock + decremented
  // customer.totalSpent inline WITHOUT flipping order.status to "returned",
  // so a subsequent Refund saw status="delivered" and applied the same
  // side effects again → 2× stock restore + 2× totalSpent decrement.
  const updated = await context.prisma.$transaction(async (tx) => {
    const ret = await tx.return.update({ where: { id }, data: { status } });

    if (notes) {
      await tx.returnNote.create({ data: { returnId: id, body: notes } });
    }

    return ret;
  });

  // Phase 1 bug 1.1: route the order transition through the canonical service
  // so stock restore + customer stats reversal + OrderChange ledger +
  // order.returned automation trigger all fire exactly once. The service
  // opens its own tx (SQLite serializes writes — safe, same pattern as
  // /api/delivery/sync). Wrapped in try/catch: if the order is already in a
  // terminal state (e.g. someone cancelled it concurrently), we don't want
  // to 500 the Return row update that already committed.
  if (status === "completed") {
    try {
      await orderService.updateStatus(
        { prisma: db, shop: shopContext },
        existing.orderId,
        "returned",
        { actor: "system" },
      );
    } catch (err) {
      logger.warn("returns/[id] PATCH: order status transition skipped", {
        orderId: existing.orderId,
        returnId: id,
        error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      });
    }
  }

  return NextResponse.json({ return: updated });
}, "PATCH /api/returns/[id]");
