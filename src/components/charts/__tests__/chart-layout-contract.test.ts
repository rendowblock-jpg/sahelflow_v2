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

  it("keeps explicit RTL chart geometry on directional axes and ranked bars", () => {
    const area = source("../area-trend-chart.tsx");
    const line = source("../line-trend-chart.tsx");
    const bars = source("../horizontal-bar-chart.tsx");

    expect(area).toContain("reversed={isRtl}");
    expect(area).toContain('orientation={isRtl ? "right" : "left"}');
    expect(line).toContain("reversed={isRtl}");
    expect(line).toContain('orientation={isRtl ? "right" : "left"}');
    expect(bars).toContain('orientation={isRtl ? "right" : "left"}');
    expect(bars).toContain('position={isRtl ? "left" : "right"}');
  });
});
