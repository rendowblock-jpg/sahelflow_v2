import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Internal.20 AAA experience authority", () => {
  it("keeps Internal.20 as the final visual cascade instead of another overridden patch", () => {
    const layout = read("src/app/layout.tsx");
    const legacy = layout.indexOf('import "./locale-transition-system.css"');
    const system = layout.indexOf('import "./internal20-system.css"');
    const palette = layout.indexOf('import "./internal20-palette.css"');
    const interaction = layout.indexOf('import "./internal20-interaction.css"');

    expect(legacy).toBeGreaterThan(-1);
    expect(system).toBeGreaterThan(legacy);
    expect(palette).toBeGreaterThan(system);
    expect(interaction).toBeGreaterThan(palette);
  });

  it("uses natural shell direction and removes the historical physical-LTR ordering trick", () => {
    const system = read("src/app/internal20-system.css");

    expect(system).toContain('[data-sahelflow-shell="desktop"][data-locale-dir="rtl"]');
    expect(system).toContain("direction: rtl !important");
    expect(system).toContain("order: 0 !important");
    expect(system).toContain('[data-sahelflow-shell="desktop"][data-locale-dir="ltr"]');
    expect(system).toContain("direction: ltr !important");
  });

  it("gives Arabic an explicit readable application scale rather than Latin microcopy density", () => {
    const system = read("src/app/internal20-system.css");

    expect(system).toContain('html[dir="rtl"] body');
    expect(system).toContain('"Segoe UI Variable Text"');
    expect(system).toContain("--control-height: 2.75rem");
    expect(system).toContain("font-size: 0.8125rem !important");
    expect(system).toContain("font-size: clamp(1.65rem, 2.4vw, 2.15rem)");
  });

  it("makes locale switching one native visual transaction with shared shell/workspace choreography", () => {
    const hook = read("src/hooks/use-i18n.ts");
    const interaction = read("src/app/internal20-interaction.css");

    expect(hook).toContain("function commitLocaleViewTransition");
    expect(hook).toContain("document.startViewTransition");
    expect(hook).toContain("commitLocaleViewTransition(() => {");
    expect(hook).toContain("commitLocale(newLocale);");
    expect(interaction).toContain("view-transition-name: sf20-navigation");
    expect(interaction).toContain("view-transition-name: sf20-inbox-queue");
    expect(interaction).toContain("view-transition-name: sf20-ai-sessions");
    expect(interaction).toContain("view-transition-name: sf20-settings-nav");
  });

  it("keeps motion clearly perceptible while preserving reduced-motion authority", () => {
    const system = read("src/app/internal20-system.css");
    const interaction = read("src/app/internal20-interaction.css");
    const chartMotion = read("src/components/charts/chart-motion.ts");

    expect(system).toContain("--sf20-motion-route: 360ms");
    expect(system).toContain("translateY(14px) scale(0.992)");
    expect(interaction).toContain("animation: sf20-overlay-in 240ms");
    expect(chartMotion).toContain("fastDuration: reducedMotion ? 0 : 480");
    expect(chartMotion).toContain("baseDuration: reducedMotion ? 0 : 680");
    expect(system).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("keeps the flagship work surface dominant at the Founder desktop size", () => {
    const interaction = read("src/app/internal20-interaction.css");

    expect(interaction).toContain("width: 20.5rem !important");
    expect(interaction).toContain("width: 17.5rem !important");
    expect(interaction).toContain("grid-template-columns: 15.5rem minmax(31rem, 1fr) 19rem !important");
    expect(interaction).toContain("min-height: calc(100dvh - 6.5rem)");
  });

  it("keeps the premium warm material palette above the legacy cold dark stack", () => {
    const palette = read("src/app/internal20-palette.css");

    expect(palette).toContain("--surface-0: oklch(0.145 0.008 78)");
    expect(palette).toContain("--surface-1: oklch(0.178 0.009 78)");
    expect(palette).toContain('html[dir="rtl"] [data-sahelflow-shell="desktop"]');
    expect(palette).toContain("circle at 84% 0%");
  });
});
