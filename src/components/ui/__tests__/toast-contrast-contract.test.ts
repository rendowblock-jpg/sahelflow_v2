import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The app turns on sonner's `richColors`, so a success / info / warning / error toast takes its text and background
 * from sonner's own stylesheet (`--success-text` on `--success-bg`, ...). In light mode those library colours fail
 * WCAG AA: measured in real Chromium on 27 Oct 2026, the "1 succeeded, 1 failed" warning toast was #dc7609 on #fffcf0
 * = 3.07:1, and the other three types are 4.26 to 4.35:1. Dark mode passes (6.5 and above). The app corrects the light
 * text colours in globals.css; this test reads both files and holds every type to 4.5:1 in both modes, so neither a
 * sonner upgrade nor an edit to the override can bring the failure back unseen.
 */
const AA = 4.5;
const TYPES = ["success", "info", "warning", "error"] as const;
const MODES = ["light", "dark"] as const;

const sonnerCss = readFileSync(resolve(process.cwd(), "node_modules/sonner/dist/styles.css"), "utf8");
const globalsCss = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

type Hsl = { h: number; s: number; l: number };
const HSL = /hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*\)/;

function parseHsl(value: string): Hsl {
  const m = value.match(HSL);
  if (!m?.[1] || !m[2] || !m[3]) throw new Error(`not an hsl() literal: ${value}`);
  return { h: Number(m[1]), s: Number(m[2]) / 100, l: Number(m[3]) / 100 };
}

function hslToRgb({ h, s, l }: Hsl): [number, number, number] {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

function luminance([r, g, b]: [number, number, number]): number {
  const lin = (v: number) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function ratio(a: Hsl, b: Hsl): number {
  const x = luminance(hslToRgb(a));
  const y = luminance(hslToRgb(b));
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Declarations of every block whose selector mentions this sonner theme, in document order (later wins). */
function themeDeclarations(css: string, mode: (typeof MODES)[number]): Map<string, { value: string; selector: string }> {
  const out = new Map<string, { value: string; selector: string }>();
  const pattern = /([^{}]*\[data-sonner-theme=['"]?(?:light|dark)['"]?\][^{}]*)\{([^{}]*)\}/g;
  for (const block of css.matchAll(pattern)) {
    const selector = (block[1] ?? "").trim();
    if (!selector.includes(`[data-sonner-theme=${selector.includes("'") ? `'${mode}'` : selector.includes('"') ? `"${mode}"` : mode}]`)) continue;
    for (const d of (block[2] ?? "").matchAll(/(--(?:success|info|warning|error)-(?:bg|text))\s*:\s*([^;]+);/g)) {
      if (d[1] && d[2]) out.set(d[1], { value: d[2].trim(), selector });
    }
  }
  return out;
}

function effective(mode: (typeof MODES)[number]): Map<string, { value: string; selector: string; from: "sonner" | "app" }> {
  const merged = new Map<string, { value: string; selector: string; from: "sonner" | "app" }>();
  for (const [k, v] of themeDeclarations(sonnerCss, mode)) merged.set(k, { ...v, from: "sonner" });
  for (const [k, v] of themeDeclarations(globalsCss, mode)) merged.set(k, { ...v, from: "app" });
  return merged;
}

describe("rich toast colours (sonner) meet WCAG AA in light and dark", () => {
  it("finds sonner's eight colour pairs in each mode (the test is reading something)", () => {
    for (const mode of MODES) {
      const sonnerOnly = themeDeclarations(sonnerCss, mode);
      for (const type of TYPES) {
        expect(sonnerOnly.has(`--${type}-text`), `sonner ${mode} --${type}-text`).toBe(true);
        expect(sonnerOnly.has(`--${type}-bg`), `sonner ${mode} --${type}-bg`).toBe(true);
      }
    }
  });

  it("every toast type has readable text on its own background in both modes", () => {
    const failures: string[] = [];
    for (const mode of MODES) {
      const colours = effective(mode);
      for (const type of TYPES) {
        const text = colours.get(`--${type}-text`);
        const bg = colours.get(`--${type}-bg`);
        if (!text || !bg) throw new Error(`${mode} ${type}: missing colour`);
        const value = ratio(parseHsl(text.value), parseHsl(bg.value));
        if (value < AA) failures.push(`${mode} ${type}: ${text.value} on ${bg.value} = ${value.toFixed(2)}:1 (text from ${text.from})`);
      }
    }
    expect(failures).toEqual([]);
  });

  it("an app override beats sonner's own rule whatever order the two stylesheets load in", () => {
    // sonner appends its <style> when it first renders, which can be after the app's CSS. Equal specificity would
    // then let the library win, so the override selector must carry more than sonner's [attr][attr] pair.
    for (const mode of MODES) {
      for (const [name, entry] of effective(mode)) {
        if (entry.from !== "app") continue;
        expect(entry.selector, `${mode} ${name}`).toMatch(/^(?:html|body|:root)[\s>]/);
      }
    }
  });
});
