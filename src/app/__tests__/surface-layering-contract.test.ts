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
 * This contract reads the two CSS files that own the surface tokens as TEXT, for
 * all 8 looks (sahel/atlas/oasis/dune x light/dark), and holds three things:
 *   1. a card is told apart from the page: lift >= 1.12:1 OR hairline >= 1.5:1;
 *   2. the surface steps are ordered (monotonic) and the roles are consistent;
 *   3. foreground and muted-foreground stay >= 4.5:1 on every surface.
 *
 * Authority (read in code): globals.css defines NO surface/background/card/border/
 * sidebar token (its :root/.dark blocks only keep radius, feedback colours and
 * shadows), so the cascade winners are
 *   - src/app/product-system.css      light :root (sahel) + html[data-theme-preset] blocks
 *   - src/app/theme-preset-system.css dark `html.dark, html.dark[data-theme-preset]`
 * The colour maths is the repo's own converter (components/charts/chart-color.ts,
 * the one contrast-contract.test.ts is built on); only the WCAG luminance formula
 * and the alpha compositing (browsers composite in gamma-encoded sRGB) live here.
 * Set SURFACE_TABLE=1 to print the lifts of every look.
 */

const LIFT_BAR = 1.12;
const HAIRLINE_BAR = 1.5;
const AA_TEXT = 4.5;

const PRESETS = ["sahel", "atlas", "oasis", "dune"] as const;
type Preset = (typeof PRESETS)[number];
type Mode = "light" | "dark";

type Declarations = Record<string, string>;
type Block = { selectors: string[]; declarations: Declarations };

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

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

const product = parseBlocks(read("src/app/product-system.css"));
const darkSystem = parseBlocks(read("src/app/theme-preset-system.css"));

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

/** Follow var() chains; a colour-mix() (accent tints) is out of scope and returns undefined. */
function resolveValue(layer: Declarations, name: string): string | undefined {
  const value = layer[name];
  if (value === undefined) throw new Error(`token ${name} is not defined in the parsed cascade`);
  const reference = value.match(/^var\(\s*(--[\w-]+)\s*\)$/);
  if (reference?.[1]) return resolveValue(layer, reference[1]);
  if (/color-mix\(/i.test(value)) return undefined;
  return value;
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
  if (!paint) throw new Error(`${name} is a colour-mix(): not an opaque literal`);
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
function layers(layer: Declarations) {
  const page = opaque(layer, "--background");
  const card = opaque(layer, "--card");
  const border = paintOf(layer, "--border");
  if (!border) throw new Error("--border must be a literal colour");
  const sidebarBorder = paintOf(layer, "--sidebar-border");
  if (!sidebarBorder) throw new Error("--sidebar-border must be a literal colour");
  const sidebar = opaque(layer, "--sidebar");
  return {
    page,
    card,
    sidebar,
    lift: ratio(card, page),
    hairline: ratio(over(border, card), card),
    sidebarHairline: ratio(over(sidebarBorder, sidebar), sidebar),
    sidebarLift: ratio(sidebar, page),
  };
}

describe("surface layering contract (F-0026)", () => {
  it("covers exactly the 8 looks the workspace offers", () => {
    expect(LOOKS.map((look) => look.label).sort()).toEqual(
      (["light", "dark"] as const).flatMap((mode) => PRESETS.map((preset) => `${preset} ${mode}`)).sort(),
    );
  });

  describe("1. a card is told apart from the page", () => {
    for (const look of LOOKS) {
      it(`${look.label}: card/page lift >= ${LIFT_BAR}:1 OR card hairline >= ${HAIRLINE_BAR}:1`, () => {
        const measured = layers(look.layer);
        const text =
          `${look.label}: page ${hex(measured.page)} card ${hex(measured.card)}: ` +
          `lift ${measured.lift.toFixed(3)}:1 (bar ${LIFT_BAR}), hairline ${measured.hairline.toFixed(3)}:1 (bar ${HAIRLINE_BAR})`;
        expect(measured.lift >= LIFT_BAR || measured.hairline >= HAIRLINE_BAR, text).toBe(true);
      });
    }
  });

  describe("2. the steps are ordered and every role is consistent", () => {
    for (const look of LOOKS) {
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

  describe("3. text keeps AA (>= 4.5:1) on every surface it sits on", () => {
    const SURFACES: Array<{ surface: string; texts: string[] }> = [
      { surface: "--background", texts: ["--foreground", "--muted-foreground"] },
      { surface: "--card", texts: ["--card-foreground", "--foreground", "--muted-foreground"] },
      { surface: "--popover", texts: ["--popover-foreground", "--foreground", "--muted-foreground"] },
      { surface: "--sidebar", texts: ["--sidebar-foreground", "--muted-foreground"] },
      { surface: "--surface-0", texts: ["--foreground", "--muted-foreground"] },
      { surface: "--surface-1", texts: ["--foreground", "--muted-foreground"] },
      { surface: "--surface-2", texts: ["--foreground", "--muted-foreground"] },
      { surface: "--surface-3", texts: ["--foreground", "--muted-foreground"] },
      { surface: "--muted", texts: ["--foreground", "--muted-foreground"] },
      { surface: "--secondary", texts: ["--secondary-foreground", "--muted-foreground"] },
      // The hover / active tints (a colour-mix() in dark, a literal in light: skipped when not a literal).
      { surface: "--accent", texts: ["--accent-foreground", "--foreground", "--muted-foreground"] },
      { surface: "--sidebar-accent", texts: ["--sidebar-accent-foreground", "--sidebar-foreground"] },
    ];
    for (const look of LOOKS) {
      it(`${look.label}: foreground and muted-foreground on every surface`, () => {
        const failing: string[] = [];
        for (const { surface, texts } of SURFACES) {
          const ground = paintOf(look.layer, surface);
          if (!ground) continue;
          for (const text of texts) {
            const value = ratio(opaque(look.layer, text), ground.rgb);
            if (value < AA_TEXT) failing.push(`${text} on ${surface} = ${value.toFixed(2)}`);
          }
        }
        expect(failing, `${look.label}: below ${AA_TEXT}:1`).toEqual([]);
      });

      it(`${look.label}: accent and active-rail text keep AA on their fill`, () => {
        const failing: string[] = [];
        for (const [fill, text] of [
          ["--accent", "--accent-foreground"],
          ["--sidebar-accent", "--sidebar-accent-foreground"],
        ] as const) {
          const ground = paintOf(look.layer, fill);
          if (!ground) continue; // a colour-mix() tint (dark): follows --surface-2 by construction
          const value = ratio(opaque(look.layer, text), ground.rgb);
          if (value < AA_TEXT) failing.push(`${text} on ${fill} = ${value.toFixed(2)}`);
        }
        expect(failing, `${look.label}: below ${AA_TEXT}:1`).toEqual([]);
      });
    }
  });

  it.skipIf(!process.env["SURFACE_TABLE"])("prints the lifts of all 8 looks", () => {
    const rows = LOOKS.map((look) => {
      const m = layers(look.layer);
      return `${look.label.padEnd(12)} page ${hex(m.page)} card ${hex(m.card)} sidebar ${hex(m.sidebar)} | card/page ${m.lift.toFixed(2)} | hairline/card ${m.hairline.toFixed(2)} | sidebar/page ${m.sidebarLift.toFixed(2)} | sidebar hairline ${m.sidebarHairline.toFixed(2)}`;
    });
    console.warn(`\nSURFACE_TABLE\n${rows.join("\n")}\n`);
  });
});
