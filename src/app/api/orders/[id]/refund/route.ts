/** POST /api/orders/[id]/refund — create a refund (Phase 4). */
import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { createRefund } from "@/lib/data/refund-service";
import { db } from "@/lib/db";
import { SahelFlowError } from "@/types/errors";
import { z } from "zod";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

const refundSchema = z.object({
  amount: z.number().int().min(1),
  method: z.enum(["cash", "credit", "bank", "courier_deduction"]),
  reason: z.string().optional(),
  returnId: z.string().optional(),
});

export const POST = withErrorHandler(async (req: NextRequest, { params }: Ctx) => {
  await requireAuth();
  const { id } = await params;
  const body = await req.json();
  const parsed = refundSchema.parse(body);

  const order = await db.order.findUnique({ where: { id }, select: { totalPrice: true, status: true } });
  if (!order) throw new SahelFlowError("Order not found", "NOT_FOUND", 404);

  const refund = await createRefund({ ...parsed, orderId: id });
  return NextResponse.json({ refund }, { status: 201 });
}, "POST /api/orders/[id]/refund");
