import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { normalizeChartColor } from "../../components/charts/chart-color";

/*
 * Surface layering contract (F-0026, STANDARD.md section 3).
 *
 * The Founder installed Internal.48 and called the dark look "too black", the light
 * look "too white" and the interface flat. Measured in a browser: the dark page
 * and the dark card were 1.05:1 apart, the light page and the light card 1.04:1,
 * and the 1 px hairline only 1.19:1 / 1.21:1. Layers were nearly invisible.
 *
 * This contract reads the CSS files that own the surface tokens as TEXT, for all
 * 8 looks (sahel/atlas/oasis/dune x light/dark), and holds:
 *   1. the card is told apart from the page: lift >= 1.12:1 (a HARD rule, no
 *      fallback to the hairline) AND the hairline is visible: the token itself
 *      >= 1.50:1 over the card AND the hairline the components really draw
 *      (`border-border/70`, i.e. token alpha x 0.7, MEASURED by the lead in
 *      Chromium: 1.36 where the token alone gives 1.57) >= 1.30 dark / 1.20 light;
 *   2. dark depth: raised (surface-2, surface-3 above it) >= 1.07:1 per step,
 *      the popover above the card; the sidebar differs from the page >= 1.02:1;
 *      every step is ordered and the roles are consistent;
 *   3. body text >= 7:1 and muted text >= 4.5:1 on every surface;
 *   4. the light card is pure white (oklch(1 0 0));
 *   5. the colours the components repeat as literals (global-error.tsx, the
 *      appearance panel previews) equal the CSS tokens.
 *
 * Authority (read in code): globals.css defines NO surface/background/card/border/
 * sidebar token (its :root/.dark blocks only keep radius, feedback colours and
 * shadows), so the cascade winners are
 *   - src/app/product-system.css      light :root (sahel) + html[data-theme-preset] blocks
 *   - src/app/theme-preset-system.css dark `html.dark, html.dark[data-theme-preset]`
 * The colour maths is the repo's own converter (components/charts/chart-color.ts,
 * the one contrast-contract.test.ts is built on); only the WCAG luminance formula
 * and the alpha compositing (browsers composite in gamma-encoded sRGB) live here.
 * A dark `color-mix(in oklch, var(--primary) N%, var(--surface-2))` tint is
 * resolved here too (linear in L and C, shorter-arc hue); any other color-mix is skipped.
 * SURFACE_TABLE=1 prints the numbers of every look; SURFACE_ROOT=<dir> reads the
 * two CSS files from another checkout (used to print the "before" table).
 */

const LIFT_BAR = 1.12;
const HAIRLINE_TOKEN_BAR = 1.5;
const HAIRLINE_EFFECTIVE_BAR = { dark: 1.3, light: 1.2 } as const;
/** Components draw the card border as `border-border/70`. */
const COMPONENT_BORDER_ALPHA = 0.7;
const RAISED_BAR = 1.07;
const SIDEBAR_BAR = 1.02;
const BODY_TEXT_BAR = 7;
const MUTED_TEXT_BAR = 4.5;

const PRESETS = ["sahel", "atlas", "oasis", "dune"] as const;
type Preset = (typeof PRESETS)[number];
type Mode = "light" | "dark";

type Declarations = Record<string, string>;
type Block = { selectors: string[]; declarations: Declarations };

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
/** The two CSS files only: another checkout can be named with SURFACE_ROOT (the "before" table). */
const readCss = (path: string) => readFileSync(resolve(process.env["SURFACE_ROOT"] ?? process.cwd(), path), "utf8");

function parseBlocks(css: string): Block[] {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const blocks: Block[] = [];
  for (const match of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const declarations: Declarations = {};
    for (const declaration of (match[2] ?? "").matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      declarations[declaration[1] ?? ""] = (declaration[2] ?? "").trim();
    }
    blocks.push({
      selectors: (match[1] ?? "").split(",").map((selector) => selector.trim().replace(/\s+/g, " ")),
      declarations,
    });
  }
  return blocks;
}

/** Every declaration of every block whose selector list contains `selector`, document order. */
function merged(blocks: Block[], selector: string): Declarations {
  const out: Declarations = {};
  for (const block of blocks) {
    if (block.selectors.includes(selector)) Object.assign(out, block.declarations);
  }
  return out;
}

const product = parseBlocks(readCss("src/app/product-system.css"));
const darkSystem = parseBlocks(readCss("src/app/theme-preset-system.css"));
const globalsCss = parseBlocks(read("src/app/globals.css"));

/**
 * What the browser applies to <html> for one look, lowest priority first:
 * :root, .dark, html[data-theme-preset=x] (all <= 0,1,1; product-system.css), then
 * html.dark and html.dark[data-theme-preset(=x)] (theme-preset-system.css, loaded
 * after it and at least as specific). The startup-card contract checked this
 * model against real Chromium for all 8 looks.
 */
function cascade(preset: Preset, mode: Mode): Declarations {
  const light: Declarations = {
    ...merged(product, ":root"),
    ...merged(product, `html[data-theme-preset="${preset}"]`),
  };
  if (mode === "light") return light;
  return {
    ...merged(product, ":root"),
    ...merged(product, ".dark"),
    ...merged(product, `html[data-theme-preset="${preset}"]`),
    ...merged(darkSystem, "html.dark"),
    ...merged(darkSystem, "html.dark[data-theme-preset]"),
    ...merged(darkSystem, `html.dark[data-theme-preset="${preset}"]`),
  };
}

type Rgb = [number, number, number];
type Paint = { rgb: Rgb; alpha: number };

const OKLCH_LITERAL = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/i;
const OKLCH_MIX =
  /^color-mix\(\s*in oklch\s*,\s*(var\(--[\w-]+\)|oklch\([^)]*\))\s+(\d+(?:\.\d+)?)%\s*,\s*(var\(--[\w-]+\)|oklch\([^)]*\))\s*\)$/i;

/** Follow var() chains; an oklch color-mix of two opaque literals is mixed, any other color-mix returns undefined. */
function resolveValue(layer: Declarations, name: string): string | undefined {
  const value = layer[name];
  if (value === undefined) throw new Error(`token ${name} is not defined in the parsed cascade`);
  const reference = value.match(/^var\(\s*(--[\w-]+)\s*\)$/);
  if (reference?.[1]) return resolveValue(layer, reference[1]);
  if (/color-mix\(/i.test(value)) return mixed(layer, value);
  return value;
}

function mixed(layer: Declarations, expression: string): string | undefined {
  const match = expression.match(OKLCH_MIX);
  if (!match) return undefined;
  const operand = (text: string | undefined) => {
    const reference = (text ?? "").match(/^var\(\s*(--[\w-]+)\s*\)$/);
    const literal = reference?.[1] ? resolveValue(layer, reference[1]) : text;
    const parts = literal?.match(OKLCH_LITERAL);
    return parts ? { l: Number(parts[1]), c: Number(parts[2]), h: Number(parts[3]) } : undefined;
  };
  const first = operand(match[1]);
  const second = operand(match[3]);
  if (!first || !second) return undefined;
  const weight = Number(match[2]) / 100;
  let delta = second.h - first.h;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  const hue = (((first.h + delta * (1 - weight)) % 360) + 360) % 360;
  const l = first.l * weight + second.l * (1 - weight);
  const c = first.c * weight + second.c * (1 - weight);
  return `oklch(${l.toFixed(4)} ${c.toFixed(4)} ${hue.toFixed(2)})`;
}

function paintOf(layer: Declarations, name: string): Paint | undefined {
  const value = resolveValue(layer, name);
  if (value === undefined) return undefined;
  const rgb = normalizeChartColor(value).match(/^rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)$/);
  if (!rgb) throw new Error(`${name} = "${value}" did not convert to sRGB`);
  return {
    rgb: [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])],
    alpha: rgb[4] === undefined ? 1 : Number(rgb[4]),
  };
}

function opaque(layer: Declarations, name: string): Rgb {
  const paint = paintOf(layer, name);
  if (!paint) throw new Error(`${name} is a colour-mix() this contract cannot resolve`);
  return paint.rgb;
}

/** `top` painted over `ground`, composited per 8-bit channel like a browser. */
function over(top: Paint, ground: Rgb): Rgb {
  return top.rgb.map((channel, index) =>
    Math.round(top.alpha * channel + (1 - top.alpha) * (ground[index] ?? 0)),
  ) as Rgb;
}

function luminance(rgb: Rgb): number {
  const [r = 0, g = 0, b = 0] = rgb.map((channel) => {
    const srgb = channel / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [Math.max(luminance(a), luminance(b)), Math.min(luminance(a), luminance(b))];
  return (hi + 0.05) / (lo + 0.05);
}

const hex = (rgb: Rgb) => `#${rgb.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;

const LOOKS: Array<{ label: string; preset: Preset; mode: Mode; layer: Declarations }> = (["light", "dark"] as const).flatMap(
  (mode) => PRESETS.map((preset) => ({ label: `${preset} ${mode}`, preset, mode, layer: cascade(preset, mode) })),
);

/** The numbers every assertion below uses, per look. */
function layers(look: { mode: Mode; layer: Declarations }) {
  const { layer } = look;
  const page = opaque(layer, "--background");
  const card = opaque(layer, "--card");
  const border = paintOf(layer, "--border");
  if (!border) throw new Error("--border must be a literal colour");
  const sidebarBorder = paintOf(layer, "--sidebar-border");
  if (!sidebarBorder) throw new Error("--sidebar-border must be a literal colour");
  const sidebar = opaque(layer, "--sidebar");
  const surface2 = opaque(layer, "--surface-2");
  const surface3 = opaque(layer, "--surface-3");
  const popover = opaque(layer, "--popover");
  return {
    page,
    card,
    sidebar,
    surface2,
    surface3,
    popover,
    lift: ratio(card, page),
    hairline: ratio(over(border, card), card),
    effectiveHairline: ratio(over({ ...border, alpha: border.alpha * COMPONENT_BORDER_ALPHA }, card), card),
    sidebarHairline: ratio(over(sidebarBorder, sidebar), sidebar),
    sidebarLift: ratio(sidebar, page),
    raised: ratio(surface2, card),
    raisedAgain: ratio(surface3, surface2),
    popoverOverCard: ratio(popover, card),
  };
}

describe("surface layering contract (F-0026)", () => {
  it("covers exactly the 8 looks the workspace offers", () => {
    expect(LOOKS.map((look) => look.label).sort()).toEqual(
      (["light", "dark"] as const).flatMap((mode) => PRESETS.map((preset) => `${preset} ${mode}`)).sort(),
    );
  });

  describe("1. the card is told apart from the page, and its edge is visible", () => {
    for (const look of LOOKS) {
      const measured = layers(look);
      const where = `${look.label}: page ${hex(measured.page)} card ${hex(measured.card)}`;
      it(`${look.label}: card/page lift >= ${LIFT_BAR}:1 (hard rule, the hairline cannot stand in for it)`, () => {
        expect(measured.lift, `${where}: lift ${measured.lift.toFixed(3)}:1`).toBeGreaterThanOrEqual(LIFT_BAR);
      });
      it(`${look.label}: hairline >= ${HAIRLINE_TOKEN_BAR}:1 as a token and >= ${HAIRLINE_EFFECTIVE_BAR[look.mode]}:1 as drawn (border-border/70)`, () => {
        expect(measured.hairline, `${where}: token hairline ${measured.hairline.toFixed(3)}:1`).toBeGreaterThanOrEqual(HAIRLINE_TOKEN_BAR);
        expect(
          measured.effectiveHairline,
          `${where}: hairline as drawn (alpha x ${COMPONENT_BORDER_ALPHA}) ${measured.effectiveHairline.toFixed(3)}:1`,
        ).toBeGreaterThanOrEqual(HAIRLINE_EFFECTIVE_BAR[look.mode]);
      });
    }
  });

  describe("2. depth: raised steps, the rail, the order of the steps", () => {
    for (const look of LOOKS) {
      const measured = layers(look);
      it(`${look.label}: the sidebar differs from the page by >= ${SIDEBAR_BAR}:1`, () => {
        expect(measured.sidebarLift, `${look.label}: sidebar ${hex(measured.sidebar)} vs page ${hex(measured.page)}`).toBeGreaterThanOrEqual(SIDEBAR_BAR);
      });

      if (look.mode === "dark") {
        it(`${look.label}: raised (surface-2) and above it (surface-3) are each >= ${RAISED_BAR}:1 over the step below; the popover is above the card`, () => {
          expect(measured.raised, `surface-2 ${hex(measured.surface2)} over card ${hex(measured.card)}: ${measured.raised.toFixed(3)}:1`).toBeGreaterThanOrEqual(RAISED_BAR);
          expect(measured.raisedAgain, `surface-3 ${hex(measured.surface3)} over surface-2 ${hex(measured.surface2)}: ${measured.raisedAgain.toFixed(3)}:1`).toBeGreaterThanOrEqual(RAISED_BAR);
          expect(measured.popoverOverCard, `popover ${hex(measured.popover)} over card: ${measured.popoverOverCard.toFixed(3)}:1`).toBeGreaterThanOrEqual(RAISED_BAR);
        });
      }

      it(`${look.label}: surface steps are monotonic`, () => {
        const lum = (name: string) => luminance(opaque(look.layer, name));
        if (look.mode === "dark") {
          // The canvas is the darkest; every step up is lighter. A popover floats ABOVE a card.
          const chain = ["--surface-0", "--sidebar", "--surface-1", "--surface-2", "--surface-3"];
          chain.slice(1).forEach((name, index) => {
            const below = chain[index] as string;
            expect(lum(name), `${look.label}: ${name} must be lighter than ${below}`).toBeGreaterThan(lum(below));
          });
          expect(lum("--popover"), `${look.label}: --popover must be lighter than --card`).toBeGreaterThan(lum("--card"));
        } else {
          // Light: the card is the lightest layer; the rail, the well and the sunk step get successively darker.
          const chain = ["--card", "--background", "--sidebar", "--surface-2", "--surface-3"];
          chain.slice(1).forEach((name, index) => {
            const above = chain[index] as string;
            expect(lum(name), `${look.label}: ${name} must be darker than ${above}`).toBeLessThan(lum(above));
          });
          expect(lum("--popover"), `${look.label}: --popover must not be darker than --card`).toBeGreaterThanOrEqual(lum("--card"));
        }
      });

      it(`${look.label}: surface-0 is the page canvas (--background), surface-1 is the card (--card)`, () => {
        expect(hex(opaque(look.layer, "--surface-0")), "--surface-0 vs --background").toBe(hex(opaque(look.layer, "--background")));
        expect(hex(opaque(look.layer, "--surface-1")), "--surface-1 vs --card").toBe(hex(opaque(look.layer, "--card")));
      });
    }
  });

  describe(`3. body text >= ${BODY_TEXT_BAR}:1 and muted text >= ${MUTED_TEXT_BAR}:1 on every surface`, () => {
    // body = the foreground that is meant to sit on that surface (plus --foreground, which any surface may carry).
    const SURFACES: Array<{ surface: string; body: string[]; muted: string[] }> = [
      { surface: "--background", body: ["--foreground"], muted: ["--muted-foreground"] },
      { surface: "--card", body: ["--card-foreground", "--foreground"], muted: ["--muted-foreground"] },
      { surface: "--popover", body: ["--popover-foreground", "--foreground"], muted: ["--muted-foreground"] },
      { surface: "--sidebar", body: ["--sidebar-foreground", "--foreground"], muted: ["--muted-foreground"] },
      { surface: "--surface-0", body: ["--foreground"], muted: ["--muted-foreground"] },
      { surface: "--surface-1", body: ["--foreground"], muted: ["--muted-foreground"] },
      { surface: "--surface-2", body: ["--foreground"], muted: ["--muted-foreground"] },
      { surface: "--surface-3", body: ["--foreground"], muted: ["--muted-foreground"] },
      { surface: "--muted", body: ["--foreground"], muted: ["--muted-foreground"] },
      { surface: "--secondary", body: ["--secondary-foreground", "--foreground"], muted: ["--muted-foreground"] },
      // The hover / active tints: a literal in light, an oklch color-mix of the primary into surface-2 in dark.
      { surface: "--accent", body: ["--accent-foreground", "--foreground"], muted: ["--muted-foreground"] },
      { surface: "--sidebar-accent", body: ["--sidebar-accent-foreground", "--sidebar-foreground"], muted: [] },
    ];
    for (const look of LOOKS) {
      it(`${look.label}: body text >= ${BODY_TEXT_BAR}:1 and muted text >= ${MUTED_TEXT_BAR}:1 on every surface`, () => {
        const belowBody: string[] = [];
        const belowMuted: string[] = [];
        for (const { surface, body, muted } of SURFACES) {
          const ground = paintOf(look.layer, surface);
          if (!ground) throw new Error(`${look.label}: ${surface} could not be resolved to a colour`);
          for (const text of body) {
            const value = ratio(opaque(look.layer, text), ground.rgb);
            if (value < BODY_TEXT_BAR) belowBody.push(`${text} on ${surface} = ${value.toFixed(2)}`);
          }
          for (const text of muted) {
            const value = ratio(opaque(look.layer, text), ground.rgb);
            if (value < MUTED_TEXT_BAR) belowMuted.push(`${text} on ${surface} = ${value.toFixed(2)}`);
          }
        }
        expect(belowBody, `${look.label}: body text below ${BODY_TEXT_BAR}:1`).toEqual([]);
        expect(belowMuted, `${look.label}: muted text below ${MUTED_TEXT_BAR}:1`).toEqual([]);
      });
    }
  });

  describe("4. the light card is pure white", () => {
    for (const look of LOOKS.filter((entry) => entry.mode === "light")) {
      it(`${look.label}: --card, --surface-1 and --popover are oklch(1 0 0)`, () => {
        for (const name of ["--card", "--surface-1", "--popover"]) {
          expect(resolveValue(look.layer, name), `${look.label}: ${name}`).toBe("oklch(1 0 0)");
        }
      });
    }
  });

  describe("5. colours repeated as literals in component code equal the CSS tokens", () => {
    const dark = cascade("sahel", "dark");
    // The error screen cannot read the tokens at runtime (it renders when the app shell has failed), so it repeats them.
    // --destructive is the one dark token that lives in globals.css.
    const darkWithFeedback: Declarations = { ...merged(globalsCss, ".dark"), ...dark };
    const rgba = (value: string): string => normalizeChartColor(value);
    const literalsIn = (source: string) => [...source.matchAll(/oklch\([^)]*\)/g)].map((match) => match[0]);

    it("global-error.tsx holds the dark surface, text and accent tokens (no stale charcoal)", () => {
      const source = read("src/app/global-error.tsx");
      const literals = new Set(literalsIn(source).map(rgba));
      const expected: Array<[string, string]> = [
        ["--surface-0 (page)", "--surface-0"],
        ["--surface-2 (retry button)", "--surface-2"],
        ["--foreground", "--foreground"],
        ["--muted-foreground", "--muted-foreground"],
        ["--input (retry button border)", "--input"],
        ["--primary", "--primary"],
        ["--primary-foreground", "--primary-foreground"],
        ["--destructive", "--destructive"],
      ];
      const missing = expected
        .filter(([, token]) => !literals.has(rgba(resolveValue(darkWithFeedback, token) ?? "")))
        .map(([label, token]) => `${label}: the file has no ${resolveValue(darkWithFeedback, token)}`);
      expect(missing, "global-error.tsx drifted from theme-preset-system.css").toEqual([]);

      // Every neutral charcoal (hue 260) literal in it must be one of the surface tokens.
      const surfaces = new Set(
        ["--surface-0", "--surface-1", "--surface-2", "--surface-3", "--popover", "--sidebar"].map((token) => rgba(resolveValue(dark, token) ?? "")),
      );
      const stale = literalsIn(source).filter((literal) => /\s260\)$/.test(literal) && !surfaces.has(rgba(literal)));
      expect(stale, "a dark charcoal literal in global-error.tsx is not a surface token").toEqual([]);
    });

    it("the Appearance panel's dark preview swatches use the card (canvas) and sidebar (rail) tokens of every preset", () => {
      const source = read("src/components/settings/appearance-panel.tsx");
      const block = source.slice(source.indexOf("const PRESET_PREVIEW"));
      for (const preset of PRESETS) {
        const entry = block.slice(block.indexOf(`  ${preset}: {`), block.indexOf("},", block.indexOf(`  ${preset}: {`)));
        const canvas = entry.match(/canvas:\s*"([^"]+)"/)?.[1];
        const rail = entry.match(/rail:\s*"([^"]+)"/)?.[1];
        const tokens = cascade(preset, "dark");
        expect(canvas && rgba(canvas), `${preset} preview canvas = dark --surface-1 ${resolveValue(tokens, "--surface-1")}`).toBe(rgba(resolveValue(tokens, "--surface-1") ?? ""));
        expect(rail && rgba(rail), `${preset} preview rail = dark --sidebar ${resolveValue(tokens, "--sidebar")}`).toBe(rgba(resolveValue(tokens, "--sidebar") ?? ""));
      }
    });
  });

  it.skipIf(!process.env["SURFACE_TABLE"])("prints the numbers of all 8 looks", () => {
    const rows = LOOKS.map((look) => {
      const m = layers(look);
      return [
        look.label.padEnd(11),
        `page ${hex(m.page)} sidebar ${hex(m.sidebar)} card ${hex(m.card)} s2 ${hex(m.surface2)} s3 ${hex(m.surface3)} popover ${hex(m.popover)}`,
        `card/page ${m.lift.toFixed(3)} | sidebar/page ${m.sidebarLift.toFixed(3)} | hairline token ${m.hairline.toFixed(3)} drawn ${m.effectiveHairline.toFixed(3)} | s2/card ${m.raised.toFixed(3)} s3/s2 ${m.raisedAgain.toFixed(3)} popover/card ${m.popoverOverCard.toFixed(3)}`,
      ].join(" | ");
    });
    console.warn(`\nSURFACE_TABLE\n${rows.join("\n")}\n`);
  });
});
