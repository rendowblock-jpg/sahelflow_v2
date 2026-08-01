import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { getReturnRateByWilaya, getReturnRateByProduct, getLastNDays } from "@/lib/data/analytics-v2";

export const dynamic = "force-dynamic";

export const GET = withErrorHandler(async (req: NextRequest) => {
  await requireAuth("analytics.read");
  const days = parseInt(req.nextUrl.searchParams.get("days") ?? "30", 10);
  const groupBy = req.nextUrl.searchParams.get("groupBy") ?? "wilaya";
  const range = getLastNDays(days);

  const data = groupBy === "product"
    ? await getReturnRateByProduct(range)
    : await getReturnRateByWilaya(range);

  return NextResponse.json({ data, range: { from: range.from, to: range.to } });
}, "GET /api/analytics/return-rate");
