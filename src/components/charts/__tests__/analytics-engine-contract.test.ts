import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SOURCE_ROOT = join(ROOT, "src");
const forbiddenEngine = ["re", "charts"].join("");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx|js|jsx)$/.test(entry) ? [path] : [];
  });
}

describe("Class-AAA analytics engine boundary", () => {
  it("uses ECharts without a legacy chart-engine dependency", () => {
    const packageJson = JSON.parse(
      readFileSync(join(ROOT, "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string> };
    expect(packageJson.dependencies?.echarts).toBe("6.1.0");
    expect(packageJson.dependencies?.[forbiddenEngine]).toBeUndefined();
  });

  it("contains no legacy chart-engine imports in application source", () => {
    const offenders = sourceFiles(SOURCE_ROOT).flatMap((path) => {
      const content = readFileSync(path, "utf8");
      const importPattern = new RegExp(
        `(?:from\\s+|import\\s*)[\"']${forbiddenEngine}[\"']`,
      );
      return importPattern.test(content) ? [relative(ROOT, path)] : [];
    });
    expect(offenders).toEqual([]);
  });

  it("removes superseded circular and generic ranking primitives", () => {
    for (const filename of [
      "donut-chart.tsx",
      "horizontal-bar-chart.tsx",
      "radial-gauge.tsx",
    ]) {
      expect(existsSync(join(SOURCE_ROOT, "components", "charts", filename))).toBe(
        false,
      );
    }
  });
});
