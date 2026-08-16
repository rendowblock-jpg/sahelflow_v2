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
  it("keeps chronological data semantics while making presentation locale-native", () => {
    for (const path of CARTESIAN_PRIMITIVES) {
      const source = read(path);
      expect(source, path).toContain("dir={dir}");
      expect(source, path).toContain('const rtl = dir === "rtl"');
    }

    const area = read("src/components/charts/area-trend-chart.tsx");
    const line = read("src/components/charts/line-trend-chart.tsx");
    const composed = read("src/components/charts/composed-trend-chart.tsx");
    const horizontal = read("src/components/charts/horizontal-bar-chart.tsx");
    const dualBar = read("src/components/charts/dual-bar-chart.tsx");

    expect(area).toContain('orientation={rtl ? "right" : "left"}');
    expect(line).toContain('orientation={rtl ? "right" : "left"}');
    expect(composed).toContain('orientation={rtl ? "right" : "left"}');
    expect(composed).toContain('orientation={rtl ? "left" : "right"}');
    expect(horizontal).toContain("reversed={rtl}");
    expect(horizontal).toContain('position={rtl ? "left" : "right"}');
    expect(dualBar).toContain("dir={dir}");
    expect(dualBar).toContain('orientation={isRtl ? "right" : "left"}');
  });
});
