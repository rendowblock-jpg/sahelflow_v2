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
      "../horizontal-bar-chart.tsx",
      "../donut-chart.tsx",
    ]) {
      const chart = source(file);
      expect(chart).toContain("DEFAULT_CHART_HEIGHT");
      expect(chart).not.toContain("height = 300");
      expect(chart).toContain("height?: ChartHeight");
    }
  });

  it("keeps data semantics stable while analytical presentation follows locale direction", () => {
    const area = source("../area-trend-chart.tsx");
    const line = source("../line-trend-chart.tsx");
    const bars = source("../horizontal-bar-chart.tsx");
    const dual = source("../dual-bar-chart.tsx");

    // Time-series data order stays semantic; Arabic changes the presentation
    // frame rather than reversing the underlying chronological sequence.
    for (const chart of [area, line, dual]) {
      expect(chart).not.toContain("reversed={rtl}");
      expect(chart).not.toContain("reversed={isRtl}");
    }

    expect(area).toContain('orientation={rtl ? "right" : "left"}');
    expect(line).toContain('orientation={rtl ? "right" : "left"}');

    // Horizontal quantitative bars intentionally mirror their numeric origin,
    // category axis and value label placement for the active writing direction.
    expect(bars).toContain("reversed={rtl}");
    expect(bars).toContain('orientation={rtl ? "right" : "left"}');
    expect(bars).toContain('position={rtl ? "left" : "right"}');

    expect(dual).toContain('direction: isRtl ? "rtl" : "ltr"');
    expect(dual).toContain('orientation={isRtl ? "right" : "left"}');
  });
});
