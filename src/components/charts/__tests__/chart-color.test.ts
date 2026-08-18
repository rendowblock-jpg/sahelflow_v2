import { describe, expect, it } from "vitest";

import { normalizeChartColor } from "../chart-color";

describe("ECharts color boundary", () => {
  it("converts neutral OKLCH tokens to animation-safe sRGB", () => {
    expect(normalizeChartColor("oklch(1 0 0)")).toBe("rgb(255, 255, 255)");
    expect(normalizeChartColor("oklch(0 0 0 / 50%)")).toBe(
      "rgba(0, 0, 0, 0.5)",
    );
  });

  it("normalizes chromatic SahelFlow tokens without leaking OKLCH to ZRender", () => {
    const normalized = normalizeChartColor("oklch(0.68 0.19 250)");
    expect(normalized).toMatch(/^rgb\(\d+, \d+, \d+\)$/);
    expect(normalized).not.toContain("oklch");
  });

  it("leaves already compatible CSS colors unchanged", () => {
    expect(normalizeChartColor("#2563eb")).toBe("#2563eb");
    expect(normalizeChartColor("rgb(37, 99, 235)")).toBe("rgb(37, 99, 235)");
    expect(normalizeChartColor("rgba(37, 99, 235, 0.5)")).toBe(
      "rgba(37, 99, 235, 0.5)",
    );
  });
});
