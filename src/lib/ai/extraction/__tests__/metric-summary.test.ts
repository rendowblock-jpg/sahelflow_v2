import { describe, expect, it } from "vitest";
import { summariseMetricRows, type MetricRow } from "../metric-summary";

const row = (method: string, confidence: number, day: string, extra: Partial<MetricRow> = {}): MetricRow => ({
  method, confidence, latencyMs: 100, isComplete: true, createdAt: new Date(`${day}T10:00:00Z`), ...extra,
});

describe("summariseMetricRows", () => {
  it("never averages a negative (not measured) value", () => {
    const out = summariseMetricRows([row("groq", -1, "2026-10-01"), row("groq", -1, "2026-10-01"), row("regex", 0.5, "2026-10-01"), row("regex", 0.7, "2026-10-01")]);
    expect(out.byMethod).toEqual([
      { method: "groq", count: 2, avgConfidence: null, confidenceBasis: "unknown", unknownConfidenceCount: 2, avgLatencyMs: 100 },
      { method: "regex", count: 2, avgConfidence: 0.6, confidenceBasis: "rule", unknownConfidenceCount: 0, avgLatencyMs: 100 },
    ]);
  });
  it("keeps old self-reported rows apart, labelled, without the unknown ones", () => {
    const out = summariseMetricRows([row("gemini", 0.9, "2026-10-01"), row("gemini", 0.9, "2026-10-01"), row("gemini", -1, "2026-10-02")]);
    expect(out.byMethod).toEqual([{ method: "gemini", count: 3, avgConfidence: 0.9, confidenceBasis: "self-reported", unknownConfidenceCount: 1, avgLatencyMs: 100 }]);
  });
  it("the daily trend averages only the offline reader's rule-based numbers", () => {
    const out = summariseMetricRows([row("groq", 0.9, "2026-10-01"), row("regex", 0.4, "2026-10-01"), row("gemini", 0.9, "2026-10-02"), row("regex", -1, "2026-10-03")]);
    expect(out.trend).toEqual([
      { date: "2026-10-01", count: 2, avgConfidence: 0.4, completeRate: 1 },
      { date: "2026-10-02", count: 1, avgConfidence: null, completeRate: 1 },
      { date: "2026-10-03", count: 1, avgConfidence: null, completeRate: 1 },
    ]);
  });
  it("completion rate and latency are plain averages", () => {
    const out = summariseMetricRows([row("regex", 0.5, "2026-10-01", { latencyMs: 100 }), row("regex", 0.5, "2026-10-01", { isComplete: false, latencyMs: 300 })]);
    expect(out.trend[0]?.completeRate).toBe(0.5);
    expect(out.byMethod[0]?.avgLatencyMs).toBe(200);
    expect(summariseMetricRows([])).toEqual({ trend: [], byMethod: [] });
  });
});
