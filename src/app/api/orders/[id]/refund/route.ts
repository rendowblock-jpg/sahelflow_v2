/** POST /api/orders/[id]/refund — create a refund (Phase 4). */
import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import {
  assertTrustedAction,
  requireTrustedAction,
} from "@/lib/identity/authorization";
import { createRefund } from "@/lib/data/refund-service";
import { db, shopContext } from "@/lib/db";
import { SahelFlowError } from "@/types/errors";
import { z } from "zod";
import { assertLegacyOrderFollowupAllowed } from "@/lib/orders/manual-order-authority";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

const refundSchema = z.object({
  amount: z.number().int().min(1),
  method: z.enum(["cash", "credit", "bank", "courier_deduction"]),
  reason: z.string().optional(),
  returnId: z.string().optional(),
  // Session 30 (AUDIT-2 A1) + 7-b P2: client-supplied idempotency key, used
  // verbatim (replay returns the original refund; key bound to a different
  // refund is rejected). No server-side derivation: partial refunds with the
  // same amount/method are distinct money movements.
  idempotencyKey: z.string().min(8).max(200).optional(),
  reference: z.string().optional(),
});

export const POST = withErrorHandler(async (req: NextRequest, { params }: Ctx) => {
  const actorContext = await requireTrustedAction("orders.update");
  assertTrustedAction(actorContext, "orders.financials.read");
  assertTrustedAction(actorContext, "orders.financials.update");
  const { id } = await params;
  const body = await req.json();
  const parsed = refundSchema.parse(body);

  const order = await db.order.findUnique({
    where: { id },
    select: {
      totalPrice: true,
      status: true,
      deletedAt: true,
      source: true,
      sourceMetadata: true,
    },
  });
  if (!order || order.deletedAt) throw new SahelFlowError("Order not found", "NOT_FOUND", 404);
  assertLegacyOrderFollowupAllowed(order.source, order.sourceMetadata);

  // Session 30 (AUDIT-2 A1) + 7-b P2: the idempotency key is caller intent and
  // is used verbatim. The previous server-derived `order+amount+method` key
  // silently swallowed a second, intentional partial refund with the same
  // amount/method (each partial refund is a distinct money movement bounded by
  // the over-refund guard), so keys are no longer synthesized here.

  const refund = await createRefund({ prisma: db, shop: shopContext }, {
    ...parsed,
    orderId: id,
  });
  return NextResponse.json({ refund }, { status: 201 });
}, "POST /api/orders/[id]/refund");
