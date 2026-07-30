/**
 * DELETE /api/orders/[id] — delete an order (only if draft or cancelled).
 * Orders with active status (confirmed/shipped/delivered) cannot be deleted
 * for audit-trail integrity — the merchant must cancel first.
 */
import { NextRequest, NextResponse } from "next/server";
import { db, shopContext } from "@/lib/db";
import { orderService } from "@/lib/data/order-service";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { SahelFlowError } from "@/types/errors";
import { requireAuth } from "@/lib/auth/server";
import { logAudit } from "@/lib/audit";
import { isTrustedManualOrderAuthority } from "@/lib/orders/manual-order-authority";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export const DELETE = withErrorHandler(async (_req: NextRequest, { params }: RouteContext) => {
  await requireAuth();
  const { id } = await params;
  const context = { prisma: db, shop: shopContext };

  const order = await db.order.findUnique({
    where: { id },
    select: { status: true, source: true, sourceMetadata: true },
  });

  if (!order) {
    throw new SahelFlowError("Order not found", "NOT_FOUND", 404);
  }

  if (isTrustedManualOrderAuthority(order.source, order.sourceMetadata)) {
    throw new SahelFlowError(
      "Canonical manual orders require a governed deletion command",
      "CANONICAL_FOLLOWUP_REQUIRED",
      409,
    );
  }

  // Only allow deletion of draft or cancelled orders
  if (!["draft", "cancelled"].includes(order.status)) {
    throw new SahelFlowError(
      "Cannot delete an active order. Cancel it first.",
      "CONFLICT",
      409,
    );
  }

  // SEC-018: pre-check for returns — Return.order has onDelete: Restrict
  // (Prisma default), so deleting an order with returns throws a FK error (500).
  // Return a clear 409 instead.
  const returns = await db.return.findMany({ where: { orderId: id }, select: { id: true } });
  if (returns.length > 0) {
    throw new SahelFlowError(
      "Cannot delete an order with returns. Delete the returns first.",
      "CONFLICT",
      409,
    );
  }

  // Phase 2: soft-delete (set deletedAt) instead of hard-delete.
  // The useUndoableDelete hook shows an undo toast; the restore route
  // un-sets deletedAt. This disproves the false "undo on delete: yes" handoff claim.
  const updated = await context.prisma.order.update({
    where: { id },
    data: { deletedAt: new Date() },
    select: { id: true, orderNumber: true, deletedAt: true },
  });

  // Audit log
  void logAudit(context, {
    action: "order.deleted",
    entity: "order",
    entityId: id,
    actor: "user",
    after: { deletedAt: updated.deletedAt?.toISOString() ?? new Date().toISOString() },
  });

  return NextResponse.json({ success: true, record: updated });
}, "DELETE /api/orders/[id]");

/**
 * PATCH /api/orders/[id] — update order fields (notes, delivery, items, etc.)
 * Status changes must go through PATCH /api/orders/[id]/status (state machine).
 */
export const PATCH = withErrorHandler(async (req: NextRequest, { params }: RouteContext) => {
  await requireAuth();
  const { id } = await params;
  const body = await req.json();
  const order = await orderService.update({ prisma: db, shop: shopContext }, id, body);
  return NextResponse.json({ order });
}, "PATCH /api/orders/[id]");
