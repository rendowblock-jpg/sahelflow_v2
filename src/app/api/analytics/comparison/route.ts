import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { getPeriodComparison, getLastNDays, getPreviousPeriod } from "@/lib/data/analytics-v2";

export const dynamic = "force-dynamic";

export const GET = withErrorHandler(async (req: NextRequest) => {
  await requireAuth();
  const days = parseInt(req.nextUrl.searchParams.get("days") ?? "30", 10);
  const current = getLastNDays(days);
  const previous = getPreviousPeriod(current);
  const data = await getPeriodComparison(current, previous);
  return NextResponse.json({ data });
}, "GET /api/analytics/comparison");
