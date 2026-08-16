import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const CARTESIAN_PRIMITIVES = [
  "src/components/charts/area-trend-chart.tsx",
  "src/components/charts/line-trend-chart.tsx",
  "src/components/charts/composed-trend-chart.tsx",
  "src/components/charts/horizontal-bar-chart.tsx",
] as const;

describe("Cartesian chart direction authority", () => {
  it("keeps the analytical coordinate plane LTR even when application copy is RTL", () => {
    for (const path of CARTESIAN_PRIMITIVES) {
      const source = read(path);
      expect(source, path).toContain('<ChartContainer\n      dir="ltr"');
      expect(source, path).not.toContain("reversed={isRtl}");
    }

    const dualBar = read("src/components/charts/dual-bar-chart.tsx");
    expect(dualBar).toContain('dir="ltr"');
  });

  it("keeps Arabic chart chrome RTL while isolating only Recharts geometry as LTR", () => {
    const arabicSystem = read("src/app/arabic-system.css");
    const chartUi = read("src/components/ui/chart.tsx");

    expect(arabicSystem).toContain('html[dir="rtl"] [data-chart-card="true"]');
    expect(arabicSystem).toContain('[data-chart-card="true"] [data-slot="chart"]');
    expect(arabicSystem).toContain("direction: ltr");
    expect(arabicSystem).toContain('[data-slot="chart-tooltip"]');
    expect(arabicSystem).toContain('[data-slot="chart-legend"]');
    expect(chartUi).toContain("dir={dir}");
    expect(chartUi).toContain('<bdi dir="ltr"');
  });
});
