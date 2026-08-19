import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function source(relativeUrl: string): string {
  return readFileSync(new URL(relativeUrl, import.meta.url), "utf8");
}

describe("Class-AAA analytical frame contract", () => {
  it("keeps ChartCard as product chrome rather than a rendering engine", () => {
    const primitives = source("../chart-primitives.tsx");

    expect(primitives).toContain("children: React.ReactNode");
    expect(primitives).toContain('data-chart-plot="true"');
    expect(primitives).not.toContain("ResponsiveContainer");
    expect(primitives).not.toContain("EChartSurface");
  });

  it("honors the chart accent contract in the analytical header", () => {
    const primitives = source("../chart-primitives.tsx");

    expect(primitives).toContain("accent,");
    expect(primitives).toContain("data-chart-header-icon");
  });

  it("centralizes full-size height normalization and responsive rendering", () => {
    const timeSeries = source("../time-series-chart.tsx");
    const composed = source("../composed-trend-chart.tsx");
    const dual = source("../dual-bar-chart.tsx");
    const runtime = source("../echarts-runtime.tsx");

    for (const chart of [timeSeries, composed, dual]) {
      expect(chart).toContain("normalizeChartHeight");
      expect(chart).toContain("EChartSurface");
    }
    expect(runtime).toContain("new ResizeObserver");
    expect(runtime).toContain("chart.resize()");
  });

  it("formats quantitative values under the active locale authority", () => {
    const timeSeries = source("../time-series-chart.tsx");
    const composed = source("../composed-trend-chart.tsx");
    const dual = source("../dual-bar-chart.tsx");

    expect(timeSeries).toContain("const { locale, dir } = useI18n()");
    expect(timeSeries).toContain("resolveFormatter(current.format, locale)");
    expect(composed).toContain("const { t, locale, dir } = useI18n()");
    expect(composed).toContain("resolveFormatter(current.format, locale)");
    expect(dual).toContain("formatCompactNumber");
    expect(dual).toContain("isolateLtr(formatCompactNumber(value, locale))");
    expect(dual).toContain("isolateLtr(formatDZD(value, locale))");
    expect(dual).not.toContain("new Intl.NumberFormat(");
  });

  it("keeps quantitative and chronological coordinates stable when Arabic is active", () => {
    for (const file of [
      "../time-series-chart.tsx",
      "../composed-trend-chart.tsx",
      "../dual-bar-chart.tsx",
    ]) {
      const chart = source(file);
      expect(chart).not.toContain("reversed={isRtl}");
      expect(chart).not.toContain('orientation={isRtl ? "right" : "left"}');
      expect(chart).not.toContain('orientation={isRtl ? "left" : "right"}');
    }

    const timeSeries = source("../time-series-chart.tsx");
    const composed = source("../composed-trend-chart.tsx");
    const dual = source("../dual-bar-chart.tsx");
    expect(timeSeries).toContain("formatter: (value: string) => isolate(value)");
    expect(composed).toContain("formatter: (value: string) => isolate(value)");
    expect(dual).toContain("formatter: (value: number) => compactValue(value)");
  });

  it("removes the rejected circular and generic ranking chart primitives", () => {
    for (const relativeUrl of [
      "../donut-chart.tsx",
      "../horizontal-bar-chart.tsx",
      "../radial-gauge.tsx",
    ]) {
      expect(existsSync(new URL(relativeUrl, import.meta.url))).toBe(false);
    }
  });

  it("centralizes motion policy and keeps tiny stat-card trends renderer-light", () => {
    const runtime = source("../echarts-runtime.tsx");
    const sparkline = source("../sparkline.tsx");

    expect(runtime).toContain("useChartMotion");
    expect(runtime).toContain("animation: !reducedMotion");
    expect(sparkline).toContain('data-chart-engine="native-svg"');
    expect(sparkline).toContain("strokeLinejoin=\"round\"");
    expect(sparkline).not.toContain("echarts");
    expect(sparkline).not.toContain("recharts");
  });

  it("removes fixed ResponsiveContainer geometry from analytical charts", () => {
    for (const file of [
      "../time-series-chart.tsx",
      "../composed-trend-chart.tsx",
      "../dual-bar-chart.tsx",
    ]) {
      const chart = source(file);
      expect(chart).not.toContain("ResponsiveContainer");
      expect(chart).not.toContain('height={300}');
    }
  });
});
