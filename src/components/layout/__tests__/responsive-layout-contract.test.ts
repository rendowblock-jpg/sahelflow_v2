import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function source(relativeUrl: string): string {
  return readFileSync(new URL(relativeUrl, import.meta.url), "utf8");
}

describe("responsive workbench layout authority", () => {
  it("keeps shared metric/card grids fluid instead of breakpoint-count locked", () => {
    const globals = source("../../../app/globals.css");

    for (const className of [".card-grid-2", ".card-grid-3", ".card-grid-4"]) {
      const start = globals.indexOf(className);
      expect(start).toBeGreaterThanOrEqual(0);
      const block = globals.slice(start, start + 260);
      expect(block).toContain("repeat(auto-fit");
      expect(block).toContain("minmax(min(100%");
    }
  });

  it("keeps one contained scroll authority with shrink-safe workspace columns", () => {
    const shell = source("../dashboard-layout.tsx");

    expect(shell).toContain("h-[100dvh]");
    expect(shell).toContain("min-w-0 flex-1");
    expect(shell).toContain("overflow-y-auto overflow-x-hidden");
    expect(shell).toContain('data-sahelflow-shell="desktop"');
  });

  it("keeps authenticated content edge-to-edge inside the desktop workbench", () => {
    const phase5 = source("../../../app/phase5.css");

    expect(phase5).toContain('[data-sahelflow-shell="desktop"] .app-content');
    expect(phase5).toContain("max-width: none");
    expect(phase5).toContain("padding-inline: var(--sf-workbench-inline)");
  });
});
