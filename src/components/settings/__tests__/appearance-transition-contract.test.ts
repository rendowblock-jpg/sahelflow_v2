import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function source(relativeUrl: string): string {
  return readFileSync(new URL(relativeUrl, import.meta.url), "utf8");
}

describe("appearance transition authority", () => {
  it("commits theme changes as one root snapshot transition", () => {
    const provider = source("../../theme-provider.tsx");
    const css = source("../../../app/product-system.css");

    expect(provider).toContain("commitAppearanceTransition");
    expect(provider).toContain("beginAppearanceTransaction");
    expect(provider).toContain("startViewTransition");
    expect(provider).not.toContain("themeSwitching");

    expect(css).toContain('html[data-appearance-transition="active"] *');
    expect(css).toContain("::view-transition-old(root)");
    expect(css).toContain("::view-transition-new(root)");
    expect(css).not.toContain("data-theme-switching");
  });

  it("persists mode and preset across packaged localhost port changes", () => {
    const provider = source("../../theme-provider.tsx");
    const layout = source("../../../app/layout.tsx");

    expect(provider).toContain('const THEME_COOKIE_KEY = "sahelflow-theme"');
    expect(provider).toContain(
      'const PRESET_COOKIE_KEY = "sahelflow-theme-preset"',
    );
    expect(provider).toContain("APPEARANCE_COOKIE_MAX_AGE_SECONDS");
    expect(provider).toContain("persistCookie(THEME_COOKIE_KEY, theme)");
    expect(provider).toContain("persistCookie(PRESET_COOKIE_KEY, preset)");
    expect(layout).toContain('cookieStore.get("sahelflow-theme")');
    expect(layout).toContain('cookieStore.get("sahelflow-theme-preset")');
    expect(layout).toContain("defaultPreset={initialPreset}");
  });

  it("makes every non-default preset a coordinated surface family, not an accent-only swap", () => {
    const css = source("../../../app/product-system.css");

    for (const preset of ["atlas", "oasis", "dune"] as const) {
      const lightSelector = `html[data-theme-preset=\"${preset}\"]`;
      const darkSelector = `html[data-theme-preset=\"${preset}\"].dark`;
      const lightStart = css.indexOf(lightSelector);
      const darkStart = css.indexOf(darkSelector);
      expect(lightStart).toBeGreaterThanOrEqual(0);
      expect(darkStart).toBeGreaterThan(lightStart);

      const lightBlock = css.slice(lightStart, darkStart);
      expect(lightBlock).toContain("--surface-0:");
      expect(lightBlock).toContain("--background:");
      expect(lightBlock).toContain("--card:");
      expect(lightBlock).toContain("--sidebar:");
      expect(lightBlock).toContain("--chart-1:");

      const nextPreset = css.indexOf('html[data-theme-preset="', darkStart + 1);
      const darkBlock = css.slice(
        darkStart,
        nextPreset === -1 ? css.length : nextPreset,
      );
      expect(darkBlock).toContain("--surface-0:");
      expect(darkBlock).toContain("--background:");
      expect(darkBlock).toContain("--card:");
      expect(darkBlock).toContain("--sidebar:");
      expect(darkBlock).toContain("--chart-1:");
    }
  });

  it("keeps reduced-motion appearance changes effectively instantaneous", () => {
    const provider = source("../../theme-provider.tsx");
    const product = source("../../../app/product-system.css");
    const motion = source("../../../app/motion-system.css");

    expect(provider).toContain("prefers-reduced-motion: reduce");
    expect(product).toContain('@media (prefers-reduced-motion: reduce)');
    expect(motion).toContain("animation-duration: 0.01ms !important;");
  });
});
