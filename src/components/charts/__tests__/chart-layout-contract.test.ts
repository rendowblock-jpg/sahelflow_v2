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

  it("keeps analytical coordinates stable while localized copy remains direction-aware", () => {
    const area = source("../area-trend-chart.tsx");
    const line = source("../line-trend-chart.tsx");
    const bars = source("../horizontal-bar-chart.tsx");
    const dual = source("../dual-bar-chart.tsx");

    for (const chart of [area, line, bars, dual]) {
      expect(chart).not.toContain("reversed={isRtl}");
      expect(chart).not.toContain('orientation={isRtl ? "right" : "left"}');
      expect(chart).not.toContain('position={isRtl ? "left" : "right"}');
    }

    expect(area).toContain('orientation="left"');
    expect(line).toContain('orientation="left"');
    expect(bars).toContain('orientation="left"');
    expect(bars).toContain('position="right"');
    expect(dual).toContain('direction: isRtl ? "rtl" : "ltr"');
  });
});
