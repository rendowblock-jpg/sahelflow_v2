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

  it("loads the founder dark-preset authority after the historical product surface definitions", () => {
    const layout = source("../../../app/layout.tsx");
    const product = layout.indexOf('import "./product-system.css"');
    const preset = layout.indexOf('import "./theme-preset-system.css"');
    const motion = layout.indexOf('import "./motion-system.css"');

    expect(product).toBeGreaterThanOrEqual(0);
    expect(preset).toBeGreaterThan(product);
    expect(motion).toBeGreaterThan(preset);
  });

  it("keeps dark structural surfaces neutral while presets remain accent and chart families", () => {
    const css = source("../../../app/theme-preset-system.css");

    expect(css).toContain("html.dark,\nhtml.dark[data-theme-preset] {");
    expect(css).toContain("--surface-0: oklch(0.145 0.004 260);");
    expect(css).toContain("--card: var(--surface-1);");
    expect(css).toContain("--border: oklch(0.94 0.006 90 / 0.12);");
    expect(css).toContain("--input: oklch(0.94 0.006 90 / 0.16);");
    expect(css).toContain("--sidebar: oklch(0.158 0.004 260);");
    expect(css).toContain("--sidebar-border: oklch(0.94 0.006 90 / 0.09);");

    for (const preset of ["sahel", "atlas", "oasis", "dune"] as const) {
      const selector = `html.dark[data-theme-preset=\"${preset}\"]`;
      const start = css.indexOf(selector);
      expect(start).toBeGreaterThanOrEqual(0);
      const next = css.indexOf('html.dark[data-theme-preset="', start + selector.length);
      const block = css.slice(start, next === -1 ? css.length : next);

      expect(block).toContain("--primary:");
      expect(block).toContain("--accent:");
      expect(block).toContain("--sidebar-primary:");
      expect(block).not.toContain("--surface-0:");
      expect(block).not.toContain("--background:");
      expect(block).not.toContain("--card:");
      expect(block).not.toContain("--popover:");
      expect(block).not.toContain("--sidebar:");
    }

    for (const preset of ["atlas", "oasis", "dune"] as const) {
      const selector = `html.dark[data-theme-preset=\"${preset}\"]`;
      const start = css.indexOf(selector);
      const next = css.indexOf('html.dark[data-theme-preset="', start + selector.length);
      const block = css.slice(start, next === -1 ? css.length : next);
      expect(block).toContain("--chart-1:");
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
