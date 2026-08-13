import { describe, expect, it } from "vitest";

import {
  DEFAULT_CHART_HEIGHT,
  normalizeChartHeight,
} from "../chart-primitives";

describe("Wave 2 chart height normalization", () => {
  it("converges legacy large numeric canvases onto the fluid shared height", () => {
    expect(normalizeChartHeight(260)).toBe(DEFAULT_CHART_HEIGHT);
    expect(normalizeChartHeight(300)).toBe(DEFAULT_CHART_HEIGHT);
    expect(normalizeChartHeight(320)).toBe(DEFAULT_CHART_HEIGHT);
  });

  it("preserves deliberately compact and explicit CSS heights", () => {
    expect(normalizeChartHeight(220)).toBe(220);
    expect(normalizeChartHeight("18rem")).toBe("18rem");
    expect(normalizeChartHeight("42vh")).toBe("42vh");
  });
});
