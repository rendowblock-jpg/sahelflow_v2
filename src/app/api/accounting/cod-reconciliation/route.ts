/** GET /api/accounting/cod-reconciliation — COD reconciliation summary (Phase 4). */
import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { getCodReconciliationSummary } from "@/lib/data/cod-service";
import { db, shopContext } from "@/lib/db";

export const dynamic = "force-dynamic";

export const GET = withErrorHandler(async (_req: NextRequest) => {
  await requireAuth();
  const summary = await getCodReconciliationSummary({ prisma: db, shop: shopContext });
  return NextResponse.json(summary);
}, "GET /api/accounting/cod-reconciliation");
