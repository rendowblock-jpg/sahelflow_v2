import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function source(relativeUrl: string): string {
  return readFileSync(new URL(relativeUrl, import.meta.url), "utf8");
}

describe("Settings Class-AAA visual system", () => {
  it("renders a flat control center instead of the rejected premium-shell mini-app", () => {
    const workspace = source("../settings-workspace.tsx");
    const layout = source("../../../app/layout.tsx");
    const css = source("../settings-control-center.module.css");
    const legacyCss = new URL("../../../app/settings-system.css", import.meta.url);

    expect(workspace).toContain('data-settings-generation="class-aaa"');
    expect(workspace).toContain('data-settings-control-center="true"');
    expect(workspace).not.toContain('data-settings-premium-shell="true"');
    expect(workspace).toContain("settings-control-center.module.css");
    expect(layout).not.toContain('import "./settings-system.css"');
    expect(existsSync(legacyCss)).toBe(false);
    expect(css).toContain('data-settings-generation="class-aaa"');
    expect(css).toContain("15.625rem");
    expect(css).toContain('html[dir="rtl"]');
    expect(css).toContain('[data-slot="card"]');
    expect(css).toContain("border-radius: 0");
    expect(css).toContain("box-shadow: none");
  });

  it("keeps Settings-only surface overrides scoped to the control center", () => {
    const css = source("../settings-control-center.module.css");
    const cardSelectors = css
      .split("\n")
      .filter((line) => line.includes('[data-slot="card"'));
    const geometrySelectors = css
      .split("\n")
      .filter((line) => line.includes("grid-template-columns"));

    expect(cardSelectors.length).toBeGreaterThan(0);
    for (const selector of cardSelectors) {
      expect(
        selector.includes(".stack") || selector.includes(".cardReset"),
      ).toBe(true);
    }

    expect(geometrySelectors).toHaveLength(2);
    expect(css).toContain(
      '[data-settings-workspace="v2"][data-settings-generation="class-aaa"]',
    );
  });
});
