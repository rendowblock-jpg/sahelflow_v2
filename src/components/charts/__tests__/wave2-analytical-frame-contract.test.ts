import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function source(relativeUrl: string): string {
  return readFileSync(new URL(relativeUrl, import.meta.url), "utf8");
}

describe("Wave 2 analytical frame contract", () => {
  it("keeps exactly one responsive chart authority per rendered chart", () => {
    const primitives = source("../chart-primitives.tsx");

    expect(primitives).toContain("children: React.ReactNode");
    expect(primitives).toContain('data-chart-plot="true"');
    expect(primitives).not.toContain("<ChartContainer");
  });

  it("honors the existing chart accent contract in the analytical header", () => {
    const primitives = source("../chart-primitives.tsx");

    expect(primitives).toContain("accent,");
    expect(primitives).toContain("accent,\n                )}");
  });

  it("normalizes legacy large heights in every full-size shared chart", () => {
    for (const file of [
      "../area-trend-chart.tsx",
      "../line-trend-chart.tsx",
      "../horizontal-bar-chart.tsx",
      "../composed-trend-chart.tsx",
      "../donut-chart.tsx",
      "../radial-gauge.tsx",
      "../dual-bar-chart.tsx",
    ]) {
      expect(source(file)).toContain("normalizeChartHeight");
    }
  });

  it("formats directional chart values under the active locale authority", () => {
    for (const file of [
      "../area-trend-chart.tsx",
      "../line-trend-chart.tsx",
      "../horizontal-bar-chart.tsx",
      "../composed-trend-chart.tsx",
    ]) {
      const chart = source(file);
      expect(chart).toMatch(
        /const\s+\{[^}]*locale[^}]*\}\s*=\s*useI18n\(\)/,
      );
      expect(chart).toContain("locale)");
    }

    const dual = source("../dual-bar-chart.tsx");
    expect(dual).toContain("new Intl.NumberFormat(");
    expect(dual).toContain('locale === "ar" ? "ar-DZ"');
    expect(dual).toContain("formatDZD(value, locale)");
  });

  it("keeps chronological semantics stable while making the coordinate frame locale-native", () => {
    const area = source("../area-trend-chart.tsx");
    const line = source("../line-trend-chart.tsx");
    const horizontal = source("../horizontal-bar-chart.tsx");
    const composed = source("../composed-trend-chart.tsx");
    const dual = source("../dual-bar-chart.tsx");

    // Chronological series are never data-reversed merely because Arabic is active.
    for (const chart of [area, line, composed, dual]) {
      expect(chart).not.toContain("reversed={rtl}");
      expect(chart).not.toContain("reversed={isRtl}");
    }

    expect(area).toContain('orientation={rtl ? "right" : "left"}');
    expect(line).toContain('orientation={rtl ? "right" : "left"}');
    expect(composed).toContain('orientation={rtl ? "right" : "left"}');
    expect(composed).toContain('orientation={rtl ? "left" : "right"}');

    // Horizontal bars are not chronological; mirroring their numeric origin and
    // labels is presentation behavior and is required for native RTL reading.
    expect(horizontal).toContain("reversed={rtl}");
    expect(horizontal).toContain('orientation={rtl ? "right" : "left"}');
    expect(horizontal).toContain('position={rtl ? "left" : "right"}');
    expect(dual).toContain('orientation={isRtl ? "right" : "left"}');
  });

  it("uses container-relative polar geometry rather than fixed pixel radii", () => {
    const donut = source("../donut-chart.tsx");
    const radial = source("../radial-gauge.tsx");

    expect(donut).toMatch(/innerRadius = "\d+%"/);
    expect(donut).toMatch(/outerRadius = "\d+%"/);
    expect(radial).toMatch(/innerRadius="\d+%"/);
    expect(radial).toMatch(/outerRadius="\d+%"/);
    expect(donut).not.toMatch(/innerRadius = \d+/);
    expect(radial).not.toMatch(/innerRadius=\{\d+\}/);
  });

  it("governs chart motion and prevents spline overshoot outside observed data", () => {
    for (const file of [
      "../area-trend-chart.tsx",
      "../line-trend-chart.tsx",
      "../horizontal-bar-chart.tsx",
      "../composed-trend-chart.tsx",
      "../donut-chart.tsx",
      "../radial-gauge.tsx",
      "../dual-bar-chart.tsx",
    ]) {
      expect(source(file)).toContain("useChartMotion");
    }
    const sparkline = source("../sparkline.tsx");
    expect(sparkline).toContain('domain={["dataMin - 1", "dataMax + 1"]}');
    expect(sparkline).toContain("isAnimationActive={false}");
  });

  it("removes the fixed 300px ResponsiveContainer from the legacy dual-bar chart", () => {
    const dual = source("../dual-bar-chart.tsx");

    expect(dual).toContain('height="100%"');
    expect(dual).not.toContain('height={300}');
  });
});
