/** POST /api/accounting/cod-reconciliation/bulk — bulk mark COD as remitted (Phase 4). */
import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { bulkMarkCodRemitted } from "@/lib/data/cod-service";
import { z } from "zod";
import { db, shopContext } from "@/lib/db";
import { assertLegacyOrderFollowupAllowed } from "@/lib/orders/manual-order-authority";

export const dynamic = "force-dynamic";

const bulkSchema = z.object({
  orderIds: z.array(z.string()).min(1),
  remittanceRef: z.string().min(1),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  await requireAuth();
  const body = await req.json();
  const parsed = bulkSchema.parse(body);
  const authorities = await db.order.findMany({
    where: { id: { in: parsed.orderIds }, deletedAt: null },
    select: { source: true, sourceMetadata: true },
  });
  for (const authority of authorities) {
    assertLegacyOrderFollowupAllowed(authority.source, authority.sourceMetadata);
  }
  const result = await bulkMarkCodRemitted(
    { prisma: db, shop: shopContext },
    parsed.orderIds,
    parsed.remittanceRef,
  );
  return NextResponse.json(result);
}, "POST /api/accounting/cod-reconciliation/bulk");
