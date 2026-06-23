/**
 * GET /api/analytics?days=30 — client-refreshable analytics report.
 *
 * Returns the full AnalyticsReport (summary + time-series + distributions
 * + top products/wilayas + sales-by-hour + delivery performance + customer
 * growth). Used by the analytics page for client-side refresh and by the
 * topbar for live KPI badges.
 */
import { NextRequest, NextResponse } from "next/server";
import { getAnalyticsReport } from "@/lib/data/analytics-data";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const daysParam = req.nextUrl.searchParams.get("days");
  const days = Number(daysParam);
  const validDays = [7, 14, 30, 90].includes(days) ? days : 30;

  const report = await getAnalyticsReport(validDays);
  return NextResponse.json({ report, days: validDays });
}
