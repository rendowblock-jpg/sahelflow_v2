import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function source(relativeUrl: string): string {
  return readFileSync(new URL(relativeUrl, import.meta.url), "utf8");
}

describe("appearance transition authority", () => {
  it("commits theme changes as one root snapshot transition", () => {
    const provider = source("../../theme-provider.tsx");
    const css = source("../../../app/phase5.css");

    expect(provider).toContain("commitAppearanceTransition");
    expect(provider).toContain("startViewTransition");
    expect(provider).not.toContain("themeSwitching");
    expect(provider).not.toContain("220");

    expect(css).toContain("::view-transition-old(root)");
    expect(css).toContain("::view-transition-new(root)");
    expect(css).not.toContain("data-theme-switching");
  });

  it("makes every non-default preset a coordinated surface family, not an accent-only swap", () => {
    const css = source("../../../app/phase5.css");

    for (const preset of ["atlas", "oasis", "dune"] as const) {
      const lightStart = css.indexOf(`:root[data-theme-preset=\"${preset}\"]`);
      const darkStart = css.indexOf(`.dark[data-theme-preset=\"${preset}\"]`);
      expect(lightStart).toBeGreaterThanOrEqual(0);
      expect(darkStart).toBeGreaterThan(lightStart);

      const lightBlock = css.slice(lightStart, darkStart);
      expect(lightBlock).toContain("--surface-0:");
      expect(lightBlock).toContain("--background:");
      expect(lightBlock).toContain("--card:");
      expect(lightBlock).toContain("--sidebar:");

      const nextPreset = css.indexOf(":root[data-theme-preset=", darkStart + 1);
      const darkBlock = css.slice(
        darkStart,
        nextPreset === -1 ? css.length : nextPreset,
      );
      expect(darkBlock).toContain("--surface-0:");
      expect(darkBlock).toContain("--background:");
      expect(darkBlock).toContain("--card:");
      expect(darkBlock).toContain("--sidebar:");
    }
  });

  it("keeps reduced-motion appearance changes effectively instantaneous", () => {
    const provider = source("../../theme-provider.tsx");
    const css = source("../../../app/phase5.css");

    expect(provider).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain("animation-duration: 0.01ms !important;");
  });
});
