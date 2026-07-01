/**
 * DELETE /api/orders/[id] — delete an order (only if draft or cancelled).
 * Orders with active status (confirmed/shipped/delivered) cannot be deleted
 * for audit-trail integrity — the merchant must cancel first.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orderService } from "@/lib/data/order-service";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { SahelFlowError } from "@/types/errors";
import { requireAuth } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export const DELETE = withErrorHandler(async (_req: NextRequest, { params }: RouteContext) => {
  await requireAuth();
  const { id } = await params;

  const order = await db.order.findUnique({
    where: { id },
    select: { status: true },
  });

  if (!order) {
    throw new SahelFlowError("Order not found", "NOT_FOUND", 404);
  }

  // Only allow deletion of draft or cancelled orders
  if (!["draft", "cancelled"].includes(order.status)) {
    throw new SahelFlowError(
      "Cannot delete an active order. Cancel it first.",
      "CONFLICT",
      409,
    );
  }

  // Delete the order (cascade will remove items, delivery, returns)
  await db.order.delete({ where: { id } });

  return NextResponse.json({ success: true });
}, "DELETE /api/orders/[id]");

/**
 * PATCH /api/orders/[id] — update order fields (notes, delivery, items, etc.)
 * Status changes must go through PATCH /api/orders/[id]/status (state machine).
 */
export const PATCH = withErrorHandler(async (req: NextRequest, { params }: RouteContext) => {
  await requireAuth();
  const { id } = await params;
  const body = await req.json();
  const order = await orderService.update({ prisma: db }, id, body);
  return NextResponse.json({ order });
}, "PATCH /api/orders/[id]");
