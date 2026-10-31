import { summariseConfidence } from "@/lib/ai/extraction/draft-feedback";
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

  // Group by day
  // S06b-11: a confidence of -1 is "not measured" (a model's own claim is no
  // longer stored as a measurement); it never enters an average.
  const byDay: Record<string, { date: string; count: number; known: number; confidenceSum: number; completeRate: number }> = {};
  const methodRows: Record<string, { count: number; latency: number; values: number[] }> = {};
  for (const m of daily) {
    const day = m.createdAt.toISOString().slice(0, 10);
    if (!byDay[day]) byDay[day] = { date: day, count: 0, known: 0, confidenceSum: 0, completeRate: 0 };
    byDay[day]!.count++;
    if (m.confidence >= 0) {
      byDay[day]!.known++;
      byDay[day]!.confidenceSum += m.confidence;
    }
    if (m.isComplete) byDay[day]!.completeRate++;
    const bucket = (methodRows[m.method] ??= { count: 0, latency: 0, values: [] });
    bucket.count++;
    bucket.latency += m.latencyMs;
    bucket.values.push(m.confidence);
  }
  const trend = Object.values(byDay).map((d) => ({
    date: d.date,
    count: d.count,
    avgConfidence: d.known > 0 ? d.confidenceSum / d.known : null,
    completeRate: d.count > 0 ? d.completeRate / d.count : 0,
  }));

  return NextResponse.json({
    total,
    completionRate: total > 0 ? complete / total : 0,
    byMethod: Object.entries(methodRows).map(([method, rows]) => {
      const summary = summariseConfidence(method, rows.values);
      return {
        method,
        count: rows.count,
        avgConfidence: summary.avgConfidence,
        confidenceBasis: summary.basis,
        unknownConfidenceCount: summary.unknownCount,
        avgLatencyMs: rows.count > 0 ? rows.latency / rows.count : 0,
      };
    }),
    trend,
  });
}, "GET /api/analytics/extraction");
