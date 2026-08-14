import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function source(relativeUrl: string): string {
  return readFileSync(new URL(relativeUrl, import.meta.url), "utf8");
}

describe("premium Settings visual system", () => {
  it("renders Settings as one scoped workspace rather than an ungoverned card stack", () => {
    const workspace = source("../settings-workspace.tsx");
    const layout = source("../../../app/layout.tsx");
    const css = source("../../../app/settings-system.css");

    expect(workspace).toContain('data-settings-premium-shell="true"');
    expect(layout).toContain('import "./settings-system.css"');
    expect(css).toContain('[data-settings-premium-shell="true"]');
    expect(css).toContain('[data-slot="card"]');
    expect(css).toContain('[data-slot="card-header"]');
    expect(css).toContain('[data-slot="card-content"]');
    expect(css).toContain("container-name: settings-workspace");
  });

  it("keeps the visual override strictly scoped to Settings", () => {
    const css = source("../../../app/settings-system.css");
    const cardSelectors = css
      .split("\n")
      .filter((line) => line.includes('[data-slot="card"'));

    expect(cardSelectors.length).toBeGreaterThan(0);
    for (const selector of cardSelectors) {
      expect(selector).toContain("data-settings-premium-shell");
    }
  });
});
