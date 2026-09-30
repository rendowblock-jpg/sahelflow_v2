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

  it("converts the lab() tokens the CSS build emits (hover emphasis must parse them)", () => {
    // Pairs taken from the built stylesheet: lightningcss writes the hex
    // fallback beside the lab() value it lowers each OKLCH token into. The
    // last two tokens sit slightly outside sRGB: the build gamut-maps its hex
    // fallback (chroma reduction) while the chart boundary clips like the
    // browser does when painting the lab() value, hence the wider tolerance.
    const pairs: Array<[string, [number, number, number], number]> = [
      ["lab(73.7456% 34.2033 54.931)", [0xff, 0x9b, 0x51], 2],
      ["lab(64.285% 40.0799 68.9983)", [0xec, 0x7c, 0x0e], 2],
      ["lab(55.2744% -8.79538 -54.9872)", [0x00, 0x8c, 0xdf], 8],
      ["lab(58.0804% -61.3492 1.84729)", [0x00, 0x9e, 0x86], 8],
    ];
    for (const [lab, [r, g, b], tolerance] of pairs) {
      const match = normalizeChartColor(lab).match(/^rgb\((\d+), (\d+), (\d+)\)$/);
      expect(match, lab).not.toBeNull();
      const [, red, green, blue] = match!.map(Number);
      expect(Math.abs(red! - r), lab).toBeLessThanOrEqual(tolerance);
      expect(Math.abs(green! - g), lab).toBeLessThanOrEqual(tolerance);
      expect(Math.abs(blue! - b), lab).toBeLessThanOrEqual(tolerance);
    }
  });

  it("keeps alpha on lab() and handles lch()/oklab()", () => {
    expect(normalizeChartColor("lab(93.0711% -.0121593 2.29042 / .12)")).toMatch(
      /^rgba\(\d+, \d+, \d+, 0\.12\)$/,
    );
    expect(normalizeChartColor("lab(100% 0 0)")).toBe("rgb(255, 255, 255)");
    expect(normalizeChartColor("lch(0% 0 0)")).toBe("rgb(0, 0, 0)");
    expect(normalizeChartColor("oklab(1 0 0)")).toBe("rgb(255, 255, 255)");
    for (const color of ["lch(60% 50 40)", "oklab(0.6 0.1 -0.1)"]) {
      expect(normalizeChartColor(color)).toMatch(/^rgb\(\d+, \d+, \d+\)$/);
    }
  });
});
