import { averageKnown, confidenceBasisOf, summariseConfidence } from "./draft-feedback";

export interface MetricRow {
  method: string;
  confidence: number;
  latencyMs: number;
  isComplete: boolean;
  createdAt: Date;
}

/** Rows come oldest first. A confidence below 0 is "not measured" and is never averaged. */
export function summariseMetricRows(rows: readonly MetricRow[]) {
  const days = new Map<string, { count: number; complete: number; rule: number[] }>();
  const methods = new Map<string, { count: number; latency: number; values: number[] }>();
  for (const row of rows) {
    const day = row.createdAt.toISOString().slice(0, 10);
    const d = days.get(day) ?? { count: 0, complete: 0, rule: [] };
    d.count += 1;
    if (row.isComplete) d.complete += 1;
    // Only the offline reader's rule-based numbers enter the daily trend.
    if (confidenceBasisOf(row.method) === "rule") d.rule.push(row.confidence);
    days.set(day, d);
    const m = methods.get(row.method) ?? { count: 0, latency: 0, values: [] };
    m.count += 1;
    m.latency += row.latencyMs;
    m.values.push(row.confidence);
    methods.set(row.method, m);
  }
  const trend = Array.from(days.entries()).map(([date, d]) => ({
    date,
    count: d.count,
    avgConfidence: averageKnown(d.rule).avg,
    completeRate: d.count > 0 ? d.complete / d.count : 0,
  }));
  const byMethod = Array.from(methods.entries()).map(([method, m]) => {
    const s = summariseConfidence(method, m.values);
    return {
      method,
      count: m.count,
      avgConfidence: s.avgConfidence,
      confidenceBasis: s.basis,
      unknownConfidenceCount: s.unknownCount,
      avgLatencyMs: m.count > 0 ? m.latency / m.count : 0,
    };
  });
  return { trend, byMethod };
}
