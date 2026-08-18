import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const CARTESIAN_AUTHORITIES = [
  "src/components/charts/time-series-chart.tsx",
  "src/components/charts/composed-trend-chart.tsx",
  "src/components/charts/dual-bar-chart.tsx",
] as const;

describe("Cartesian chart direction authority", () => {
  it("keeps quantitative and chronological geometry stable across locale direction", () => {
    for (const path of CARTESIAN_AUTHORITIES) {
      const source = read(path);
      expect(source, path).not.toContain("reversed={isRtl}");
      expect(source, path).not.toContain('orientation={isRtl ? "right" : "left"}');
      expect(source, path).not.toContain('position={isRtl ? "left" : "right"}');
    }

    const timeSeries = read("src/components/charts/time-series-chart.tsx");
    const composed = read("src/components/charts/composed-trend-chart.tsx");
    expect(timeSeries).toContain('type: "category"');
    expect(timeSeries).toContain("formatter: (value: string) => isolate(value)");
    expect(composed).toContain('type: "category"');
    expect(composed).toContain("formatter: (value: string) => isolate(value)");
  });

  it("uses one SVG ECharts geometry authority while Arabic product chrome remains RTL", () => {
    const runtime = read("src/components/charts/echarts-runtime.tsx");
    const arabicSystem = read("src/app/arabic-system.css");
    const chartBridge = read("src/components/ui/chart.tsx");

    expect(runtime).toContain('renderer: "svg"');
    expect(runtime).toContain('data-echarts-surface="true"');
    expect(runtime).toContain("extraCssText: `direction:${dir}");

    expect(arabicSystem).toContain('html[dir="rtl"] [data-chart-card="true"]');
    expect(arabicSystem).toContain('[data-echarts-surface="true"]');
    expect(arabicSystem).toContain('[data-chart-engine="native-svg"]');
    expect(arabicSystem).toContain("direction: ltr");

    expect(chartBridge).toContain("ChartConfig");
    expect(chartBridge).toContain("@/components/charts/chart-types");
    expect(chartBridge).not.toContain("ResponsiveContainer");
  });
});
