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
      expect(chart).toContain("locale } = useI18n()");
      expect(chart).toContain("locale)");
    }

    const dual = source("../dual-bar-chart.tsx");
    expect(dual).toContain("new Intl.NumberFormat(");
    expect(dual).toContain('locale === "ar" ? "ar-DZ"');
    expect(dual).toContain("formatDZD(value, locale)");
  });

  it("uses container-relative polar geometry instead of fixed full-size radii", () => {
    const donut = source("../donut-chart.tsx");
    const radial = source("../radial-gauge.tsx");

    expect(donut).toContain('innerRadius = "46%"');
    expect(donut).toContain('outerRadius = "72%"');
    expect(radial).toContain('innerRadius="66%"');
    expect(radial).toContain('outerRadius="90%"');
  });

  it("removes the fixed 300px ResponsiveContainer from the legacy dual-bar chart", () => {
    const dual = source("../dual-bar-chart.tsx");

    expect(dual).toContain('height="100%"');
    expect(dual).not.toContain('height={300}');
  });
});
