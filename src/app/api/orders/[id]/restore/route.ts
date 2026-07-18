/**
 * POST /api/orders/[id]/restore — undo a soft-deleted order (Phase 2).
 *
 * Called by the useUndoableDelete hook's "Undo" toast action. Un-sets
 * deletedAt, making the order visible again in lists + restorable to
 * its original state.
 */
import { NextRequest, NextResponse } from "next/server";
import { db, shopContext } from "@/lib/db";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { SahelFlowError } from "@/types/errors";
import { requireAuth } from "@/lib/auth/server";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export const POST = withErrorHandler(async (_req: NextRequest, { params }: RouteContext) => {
  await requireAuth();
  const { id } = await params;
  const context = { prisma: db, shop: shopContext };

  const order = await db.order.findUnique({
    where: { id },
    select: { id: true, orderNumber: true, deletedAt: true },
  });

  if (!order) {
    throw new SahelFlowError("Order not found", "NOT_FOUND", 404);
  }

  if (!order.deletedAt) {
    throw new SahelFlowError("Order is not deleted", "CONFLICT", 409);
  }

  await context.prisma.order.update({
    where: { id },
    data: { deletedAt: null },
  });

  void logAudit(context, {
    action: "order.restored",
    entity: "order",
    entityId: id,
    actor: "user",
  });

  return NextResponse.json({ success: true });
}, "POST /api/orders/[id]/restore");
