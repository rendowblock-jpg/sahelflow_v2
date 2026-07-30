/** PATCH /api/orders/[id]/cod — update COD reconciliation status (Phase 4). */
import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { markCodCollected, markCodRemitted } from "@/lib/data/cod-service";
import { z } from "zod";
import { db, shopContext } from "@/lib/db";
import { assertLegacyOrderFollowupAllowed } from "@/lib/orders/manual-order-authority";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

const codSchema = z.object({
  action: z.enum(["mark_collected", "mark_remitted"]),
  remittanceRef: z.string().optional(),
});

export const PATCH = withErrorHandler(async (req: NextRequest, { params }: Ctx) => {
  await requireAuth();
  const { id } = await params;
  const body = await req.json();
  const parsed = codSchema.parse(body);
  const context = { prisma: db, shop: shopContext };
  const authority = await db.order.findFirst({
    where: { id, deletedAt: null },
    select: { source: true, sourceMetadata: true },
  });
  if (authority) {
    assertLegacyOrderFollowupAllowed(authority.source, authority.sourceMetadata);
  }

  const order = parsed.action === "mark_collected"
    ? await markCodCollected(context, id)
    : await markCodRemitted(context, id, parsed.remittanceRef ?? "");

  return NextResponse.json({ order });
}, "PATCH /api/orders/[id]/cod");
