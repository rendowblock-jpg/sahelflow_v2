import { summariseMetricRows } from "@/lib/ai/extraction/metric-summary";
/**
 * GET /api/analytics/extraction — AI extraction accuracy metrics (Phase 5 moat).
 *
 * Aggregates ExtractionMetric records into:
 *   - Total extractions, by method (regex/gemini/none)
 *   - Average confidence, by method
 *   - Completion rate (% isComplete)
 *   - Accuracy over time (last 30 days, grouped by day)
 *   - Average latency, by method
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export const GET = withErrorHandler(async () => {
  await requireAuth(["analytics.read", "analytics.financials.read"]);

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Completion rate
  const total = await db.extractionMetric.count({
    where: { createdAt: { gte: thirtyDaysAgo } },
  });
  const complete = await db.extractionMetric.count({
    where: { createdAt: { gte: thirtyDaysAgo }, isComplete: true },
  });

  // Daily trend (last 30 days)
  const daily = await db.extractionMetric.findMany({
    where: { createdAt: { gte: thirtyDaysAgo } },
    select: { method: true, confidence: true, latencyMs: true, isComplete: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const { trend, byMethod } = summariseMetricRows(daily);

  return NextResponse.json({
    total,
    completionRate: total > 0 ? complete / total : 0,
    byMethod,
    trend,
  });
}, "GET /api/analytics/extraction");
