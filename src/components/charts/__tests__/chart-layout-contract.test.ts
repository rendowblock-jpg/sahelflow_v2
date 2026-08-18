import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function source(relativeUrl: string): string {
  return readFileSync(new URL(relativeUrl, import.meta.url), "utf8");
}

describe("shared chart layout authority", () => {
  it("uses one fluid default height instead of fixed 300px canvases", () => {
    const primitives = source("../chart-primitives.tsx");
    expect(primitives).toContain("DEFAULT_CHART_HEIGHT");
    expect(primitives).toContain("clamp(14rem, 25vw, 18rem)");
    expect(primitives).not.toContain("height = 300");

    for (const file of [
      "../area-trend-chart.tsx",
      "../line-trend-chart.tsx",
      "../time-series-chart.tsx",
      "../composed-trend-chart.tsx",
      "../dual-bar-chart.tsx",
    ]) {
      const chart = source(file);
      expect(chart).not.toContain("height = 300");
      expect(chart).toContain("height?: ChartHeight");
    }
  });

  it("keeps one responsive ECharts plot authority and stable Cartesian geometry", () => {
    const runtime = source("../echarts-runtime.tsx");
    const timeSeries = source("../time-series-chart.tsx");
    const composed = source("../composed-trend-chart.tsx");
    const dual = source("../dual-bar-chart.tsx");

    expect(runtime).toContain("new ResizeObserver");
    expect(runtime).toContain("chart.resize()");
    expect(runtime).toContain('renderer: "svg"');

    for (const chart of [timeSeries, composed, dual]) {
      expect(chart).toContain("EChartSurface");
      expect(chart).not.toContain("ResponsiveContainer");
      expect(chart).not.toContain("reversed={isRtl}");
      expect(chart).not.toContain('orientation={isRtl ? "right" : "left"}');
    }
  });

  it("keeps sparse additive periods compact without changing bounded analytical charts", () => {
    const timeSeries = source("../time-series-chart.tsx");
    expect(timeSeries).toContain("adaptiveSparseBars");
    expect(timeSeries).toContain("useSparseBars");
    expect(timeSeries).toContain('type: "bar" as const');
    expect(timeSeries).toContain("referenceLines.length === 0");
    expect(timeSeries).toContain("referenceBands.length === 0");
    expect(timeSeries).toContain("yDomain === undefined");
  });

  it("preserves truthful zero baselines for additive area charts", () => {
    const timeSeries = source("../time-series-chart.tsx");
    expect(timeSeries).toContain(
      'const preserveZeroBaseline = mode === "area" && yDomain === undefined',
    );
    expect(timeSeries).toContain(
      "min: yDomain?.[0] ?? (preserveZeroBaseline ? 0 : undefined)",
    );
    expect(timeSeries).toContain(
      "scale: yDomain === undefined && !preserveZeroBaseline",
    );
  });

  it("shows the full selected long period before optional zooming", () => {
    const timeSeries = source("../time-series-chart.tsx");
    expect(timeSeries).toContain("chartDataZoom(data.length, theme)?.map");
    expect(timeSeries).toContain("start: 0");
    expect(timeSeries).toContain("end: 100");
  });
});
