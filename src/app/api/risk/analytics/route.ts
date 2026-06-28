import { NextResponse } from "next/server";
import { getRiskAnalyticsReport } from "@/lib/risk-engine";

export const dynamic = "force-dynamic";

/** GET /api/risk/analytics — full risk analytics report (default: last 30 days) */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const days = parseInt(url.searchParams.get("days") ?? "30", 10);
  const validDays = [7, 14, 30, 90].includes(days) ? days : 30;
  const report = await getRiskAnalyticsReport(validDays);
  return NextResponse.json({ report });
}
