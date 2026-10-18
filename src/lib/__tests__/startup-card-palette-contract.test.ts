import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The native startup card is painted by Rust before any web page exists, so it
 * cannot read the workspace's CSS. Its colours are a table in
 * src-tauri/src/native_splash.rs. This test derives the same colours from the
 * workspace's own theme CSS for all 8 looks (light and dark x the four presets)
 * and fails, printing the expected values, when the table or the WebView
 * fallback template drifts from them.
 *
 * The cascade model below was checked once against real Chromium (every token
 * of all 8 looks read back through a canvas), so it is not just self-consistent.
 */

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

type Decls = Record<string, string>;
type Block = { selectors: string[]; decls: Decls };

function group(match: RegExpMatchArray, index: number): string {
  const value = match[index];
  if (value === undefined) throw new Error(`regex group ${index} is missing`);
  return value;
}

function parseBlocks(css: string): Block[] {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const blocks: Block[] = [];
  for (const match of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const decls: Decls = {};
    for (const declaration of group(match, 2).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      decls[group(declaration, 1)] = group(declaration, 2).trim();
    }
    blocks.push({
      selectors: group(match, 1).split(",").map((selector) => selector.trim().replace(/\s+/g, " ")),
      decls,
    });
  }
  return blocks;
}

/** Every declaration of every block whose selector list contains `selector`. */
function merged(blocks: Block[], selector: string): Decls {
  const out: Decls = {};
  for (const block of blocks) {
    if (block.selectors.includes(selector)) Object.assign(out, block.decls);
  }
  return out;
}

function resolveToken(name: string, layer: Decls): string {
  const value = layer[name];
  if (value === undefined) throw new Error(`token ${name} is not defined`);
  const reference = value.match(/^var\((--[\w-]+)\)$/);
  return reference ? resolveToken(group(reference, 1), layer) : value;
}

type Rgb = [number, number, number];

/** oklch(L C h [/ a]) to sRGB 0-255, clipped like a browser does for in-gamut colours. */
function oklchToRgb(value: string): { rgb: Rgb; alpha: number } {
  const match = value.match(/^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+))?\s*\)$/);
  if (!match) throw new Error(`not an oklch() colour: ${value}`);
  const lightness = Number(group(match, 1));
  const chroma = Number(group(match, 2));
  const hue = Number(group(match, 3));
  const alpha = match[4] === undefined ? 1 : Number(match[4]);
  const a = chroma * Math.cos((hue * Math.PI) / 180);
  const b = chroma * Math.sin((hue * Math.PI) / 180);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  const encode = (channel: number) => {
    const clamped = Math.min(1, Math.max(0, channel));
    return clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055;
  };
  return { rgb: linear.map((c) => Math.round(encode(c) * 255)) as Rgb, alpha };
}

function required<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`missing ${what}`);
  return value;
}

const hex = (rgb: Rgb) => rgb.map((c) => c.toString(16).padStart(2, "0")).join("").toUpperCase();

function rgbOf(hexValue: string): Rgb {
  return [0, 2, 4].map((i) => parseInt(hexValue.slice(i, i + 2), 16)) as Rgb;
}

/** Equal to within one 8-bit step per channel (browsers and this model round differently at .5). */
function near(a: string, b: string, tolerance = 1): boolean {
  const [x, y] = [rgbOf(a), rgbOf(b)];
  return x.every((channel, index) => Math.abs(channel - (y[index] ?? Number.POSITIVE_INFINITY)) <= tolerance);
}

const PRESETS = ["sahel", "atlas", "oasis", "dune"] as const;
const MODES = ["light", "dark"] as const;

type Expected = {
  top: string;
  bottom: string;
  ink: string;
  muted: string;
  primary: string;
  border: string;
  borderPct: number;
};

function expectedFromCss(): Map<string, Expected> {
  const light = parseBlocks(read("src/app/product-system.css"));
  const dark = parseBlocks(read("src/app/theme-preset-system.css"));
  const out = new Map<string, Expected>();
  for (const preset of PRESETS) {
    for (const mode of MODES) {
      let layer: Decls;
      if (mode === "light") {
        layer = { ...merged(light, ":root"), ...merged(light, `html[data-theme-preset="${preset}"]`) };
      } else {
        layer = {
          ...merged(dark, "html.dark"),
          ...merged(dark, "html.dark[data-theme-preset]"),
          ...merged(dark, `html.dark[data-theme-preset="${preset}"]`),
        };
      }
      const colour = (name: string) => oklchToRgb(resolveToken(name, layer));
      const border = colour("--border");
      out.set(`${mode}/${preset}`, {
        top: hex(colour("--card").rgb),
        bottom: hex(colour("--background").rgb),
        ink: hex(colour("--foreground").rgb),
        muted: hex(colour("--muted-foreground").rgb),
        primary: hex(colour("--primary").rgb),
        border: hex(border.rgb),
        borderPct: Math.round(border.alpha * 100),
      });
    }
  }
  return out;
}

function tableFromRust(): Map<string, Expected> {
  const rust = read("src-tauri/src/native_splash.rs");
  const out = new Map<string, Expected>();
  const pattern =
    /\(Theme::(\w+), Preset::(\w+)\) => Tokens \{\s*top: 0x([0-9A-F]{6}),\s*bottom: 0x([0-9A-F]{6}),\s*ink: 0x([0-9A-F]{6}),\s*muted: 0x([0-9A-F]{6}),\s*primary: 0x([0-9A-F]{6}),\s*border: \(0x([0-9A-F]{6}), (\d+)\),/g;
  for (const m of rust.matchAll(pattern)) {
    out.set(`${group(m, 1).toLowerCase()}/${group(m, 2).toLowerCase()}`, {
      top: group(m, 3),
      bottom: group(m, 4),
      ink: group(m, 5),
      muted: group(m, 6),
      primary: group(m, 7),
      border: group(m, 8),
      borderPct: Number(group(m, 9)),
    });
  }
  return out;
}

function arm(look: string, e: Expected): string {
  const [mode, preset] = look.split("/");
  const cap = (word = "") => word.charAt(0).toUpperCase() + word.slice(1);
  return [
    `(Theme::${cap(mode)}, Preset::${cap(preset)}) => Tokens {`,
    `    top: 0x${e.top},`,
    `    bottom: 0x${e.bottom},`,
    `    ink: 0x${e.ink},`,
    `    muted: 0x${e.muted},`,
    `    primary: 0x${e.primary},`,
    `    border: (0x${e.border}, ${e.borderPct}),`,
    `},`,
  ].join("\n");
}

describe("startup card palette follows the workspace theme CSS", () => {
  const fromCss = expectedFromCss();
  const fromRust = tableFromRust();

  it("covers exactly the 8 looks the workspace offers", () => {
    expect([...fromCss.keys()].sort()).toEqual(
      MODES.flatMap((mode) => PRESETS.map((preset) => `${mode}/${preset}`)).sort(),
    );
    expect([...fromRust.keys()].sort()).toEqual([...fromCss.keys()].sort());
  });

  it("native_splash.rs holds the CSS colours for every look", () => {
    const drift: string[] = [];
    for (const [look, want] of fromCss) {
      const got = fromRust.get(look);
      if (!got) continue;
      const tokens = ["top", "bottom", "ink", "muted", "primary"] as const;
      // The translucent border is compared loosely: 8-bit alpha quantises its colour.
      const same =
        tokens.every((token) => near(got[token], want[token])) &&
        near(got.border, want.border, 4) &&
        Math.abs(got.borderPct - want.borderPct) <= 1;
      if (!same) drift.push(`${look}: the Rust table should read\n${arm(look, want)}`);
    }
    expect(drift, `edit the Tokens table in src-tauri/src/native_splash.rs:\n${drift.join("\n")}`).toEqual([]);
  });

  it("keeps the dark canvas identical for every preset, as the app does", () => {
    const dark = PRESETS.map((preset) => required(fromCss.get(`dark/${preset}`), `dark/${preset}`));
    const first = required(dark[0], "dark/sahel");
    for (const entry of dark) {
      expect([entry.top, entry.bottom, entry.ink, entry.muted]).toEqual([
        first.top,
        first.bottom,
        first.ink,
        first.muted,
      ]);
    }
    // Only the accent differs between presets.
    expect(new Set(dark.map((entry) => entry.primary)).size).toBe(PRESETS.length);
  });
});

describe("the WebView fallback template wears the same colours", () => {
  const template = read("src-tauri/src/launch_screen.html");
  const fromCss = expectedFromCss();

  function declarations(block: string): Decls {
    const out: Decls = {};
    for (const d of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[group(d, 1)] = group(d, 2).trim();
    return out;
  }

  const blockOf = (pattern: RegExp) =>
    declarations(group(required(template.match(pattern), String(pattern)), 1));
  const base = blockOf(/:root\s*\{([^}]*)\}/);
  const lightBase = blockOf(/html\[data-theme="light"\]\s*\{([^}]*)\}/);
  const overrides = new Map<string, Decls>();
  for (const m of template.matchAll(
    /html\[data-theme="(light|dark)"\]\[data-preset="(\w+)"\]\s*\{([^}]*)\}/g,
  )) {
    overrides.set(`${group(m, 1)}/${group(m, 2)}`, declarations(group(m, 3)));
  }

  const lookOf = (mode: string | undefined, preset: string | undefined): Decls =>
    mode === "light"
      ? { ...base, ...lightBase, ...overrides.get(`light/${preset}`) }
      : { ...base, ...overrides.get(`dark/${preset}`) };

  it("is told which mode and preset to wear", () => {
    expect(template).toContain('data-theme="{{THEME}}"');
    expect(template).toContain('data-preset="{{PRESET}}"');
  });

  it("matches the CSS canvas, text colours and accent for all 8 looks", () => {
    const problems: string[] = [];
    for (const [look, want] of fromCss) {
      const [mode, preset] = look.split("/");
      const got = lookOf(mode, preset);
      const compare = (label: string, actual: string | undefined, expected: string) => {
        const value = (actual ?? "").replace("#", "").toUpperCase();
        if (value.length !== 6 || !near(value, expected)) {
          problems.push(`${look} ${label}: template has ${actual}, CSS gives #${expected}`);
        }
      };
      compare("--bg", got["--bg"], want.bottom);
      compare("--ink", got["--ink"], want.ink);
      compare("--muted", got["--muted"], want.muted);
      compare("--faint", got["--faint"], want.muted);
      compare("--accent", got["--accent"], want.primary);
    }
    expect(problems).toEqual([]);
  });

  it("keeps the brand mark's own blues for every preset (it is a fixed image)", () => {
    expect(template).toContain('stop-color="#7DD3FC"');
    expect(template).toContain('stop-color="#0EA5E9"');
    expect(template).not.toMatch(/data-preset="\w+"\]\s+#sky/);
  });
});
