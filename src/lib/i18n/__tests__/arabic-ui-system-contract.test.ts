import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Founder Arabic UI system", () => {
  it("uses the intended modern Arabic sans authority rather than the Internal.17 font regression", () => {
    const layout = read("src/app/layout.tsx");
    expect(layout).toContain("Noto_Sans_Arabic");
    expect(layout).not.toContain("IBM_Plex_Sans_Arabic");
    expect(layout).toContain('variable: "--font-arabic"');
    expect(layout).toContain('import "./arabic-system.css"');
  });

  it("keeps Arabic fallbacks sans-serif and raises the installed reading floor without breaking technical values", () => {
    const css = read("src/app/arabic-system.css");
    expect(css).toContain('html[dir="rtl"] body');
    expect(css).toContain('"Noto Sans Arabic"');
    expect(css).toContain("ui-sans-serif");
    expect(css).not.toContain('"Amiri"');
    expect(css).toContain('[data-sahelflow-shell="desktop"] .text-sm');
    expect(css).toContain("font-size: 0.9375rem");
    expect(css).toContain('[data-sahelflow-shell="desktop"] .text-xs');
    expect(css).toContain("font-size: 0.8125rem");
    expect(css).toContain(".technical-value");
    expect(css).toContain(".numeric-value");
    expect(css).toContain("var(--font-inter)");
  });
});
