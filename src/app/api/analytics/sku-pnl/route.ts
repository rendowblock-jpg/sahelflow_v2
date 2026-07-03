import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { getSkuPnl, getLastNDays } from "@/lib/data/analytics-v2";

export const dynamic = "force-dynamic";

export const GET = withErrorHandler(async (req: NextRequest) => {
  await requireAuth();
  const days = parseInt(req.nextUrl.searchParams.get("days") ?? "30", 10);
  const range = getLastNDays(days);
  const data = await getSkuPnl(range);
  return NextResponse.json({ data, range: { from: range.from, to: range.to } });
}, "GET /api/analytics/sku-pnl");
