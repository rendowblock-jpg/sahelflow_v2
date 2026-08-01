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

  // Total by method
  const byMethod = await db.extractionMetric.groupBy({
    by: ["method"],
    where: { createdAt: { gte: thirtyDaysAgo } },
    _count: { _all: true },
    _avg: { confidence: true, latencyMs: true },
  });

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
    select: { method: true, confidence: true, isComplete: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  // Group by day
  const byDay: Record<string, { date: string; count: number; avgConfidence: number; completeRate: number }> = {};
  for (const m of daily) {
    const day = m.createdAt.toISOString().slice(0, 10);
    if (!byDay[day]) byDay[day] = { date: day, count: 0, avgConfidence: 0, completeRate: 0 };
    byDay[day]!.count++;
    byDay[day]!.avgConfidence += m.confidence;
    if (m.isComplete) byDay[day]!.completeRate++;
  }
  const trend = Object.values(byDay).map((d) => ({
    ...d,
    avgConfidence: d.count > 0 ? d.avgConfidence / d.count : 0,
    completeRate: d.count > 0 ? d.completeRate / d.count : 0,
  }));

  return NextResponse.json({
    total,
    completionRate: total > 0 ? complete / total : 0,
    byMethod: byMethod.map((m) => ({
      method: m.method,
      count: m._count._all,
      avgConfidence: m._avg.confidence ?? 0,
      avgLatencyMs: m._avg.latencyMs ?? 0,
    })),
    trend,
  });
}, "GET /api/analytics/extraction");
