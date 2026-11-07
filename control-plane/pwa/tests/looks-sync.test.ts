// The phone's colours ARE the desktop's colours. looks.css is generated from the desktop's three colour files; this test
// regenerates it and compares, so a change of a desktop look that is not carried to the phone fails here.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readDesktop } from "../tools/gen-looks.mjs";
import { buildLooks, generateLooksCss, LOOKS, MODES, toHexAlpha } from "../tools/looks.mjs";

const here = (p: string): string => new URL(p, import.meta.url).pathname;
const read = (p: string): string => readFileSync(here(p), "utf8");
const sha = (p: string): string => createHash("sha256").update(readFileSync(here(p))).digest("hex");

describe("looks.css", () => {
  it("is exactly what the generator writes from the desktop files (run `node control-plane/pwa/tools/gen-looks.mjs` when this fails)", () => {
    expect(read("../src/styles/looks.css")).toBe(generateLooksCss(readDesktop()));
  });
  it("has the 4 looks x light/dark, plus the same dark for a phone set to follow the device", () => {
    const css = read("../src/styles/looks.css");
    for (const l of LOOKS) {
      expect(css, l).toContain(`:root[data-look=${l}]{`);
      expect(css, l).toContain(`:root[data-theme=dark][data-look=${l}]{`);
      expect(css, l).toContain(`:root:not([data-theme])[data-look=${l}]{`);
    }
    expect(css).toContain("@media (prefers-color-scheme:dark)");
  });
  it("the desktop's own look names are the phone's look names", () => {
    const preset = readFileSync(here("../../../src/lib/appearance/preset.ts"), "utf8");
    expect(preset).toContain(`PRESETS = [${LOOKS.map((l) => `"${l}"`).join(", ")}] as const`);
  });
  it("the colour maths agrees with what Chrome 149 painted for the same CSS values (measured on screenshot pixels, 6 Nov 2026)", () => {
    const measured: Array<[string, string]> = [
      ["oklch(0.485 0.18 150)", "#007819"], ["oklch(0.520 0.245 27.325)", "#D20000"],
      ["color-mix(in oklch, oklch(0.520 0.245 27.325) 80%, black)", "#9B0000"], ["color-mix(in oklch, oklch(0.485 0.2 145) 80%, black)", "#005800"],
      ["color-mix(in oklch, oklch(0.520 0.16 72) 80%, black)", "#753C00"], ["oklch(0.704 0.191 22.216)", "#FF6467"],
      ["oklch(0.72 0.19 145)", "#43C251"], ["oklch(0.78 0.16 80)", "#ECAA0B"],
    ];
    for (const [css, px] of measured) {
      const got = toHexAlpha(css).hex;
      for (const i of [1, 3, 5]) expect(Math.abs(parseInt(got.slice(i, i + 2), 16) - parseInt(px.slice(i, i + 2), 16)), `${css}: ${got} vs Chrome ${px}`).toBeLessThanOrEqual(1);
    }
  });
});

describe("the phone wears the desktop's page", () => {
  it("the splash and address-bar colours are the Sahel page colours, light and dark", () => {
    const L = buildLooks(readDesktop());
    const b = read("../build.mjs");
    expect(b).toContain(`name="theme-color" content="${L["sahel/light"]?.background}" media="(prefers-color-scheme: light)"`);
    expect(b).toContain(`name="theme-color" content="${L["sahel/dark"]?.background}" media="(prefers-color-scheme: dark)"`);
    expect(b).toContain(`theme_color: "${L["sahel/light"]?.background}", background_color: "${L["sahel/light"]?.background}"`);
  });
  it("the two fonts are the desktop's two fonts, byte for byte, and the old Carnet fonts are gone", () => {
    expect(sha("../static/fonts/inter-latin.woff2")).toBe(sha("../../../src/app/fonts/inter-latin-wght-normal.woff2"));
    expect(sha("../static/fonts/noto-sans-arabic.woff2")).toBe(sha("../../../src/app/fonts/noto-sans-arabic-arabic-wght-normal.woff2"));
    expect(readdirSync(here("../static/fonts")).sort()).toEqual(["LICENSE.txt", "inter-latin.woff2", "noto-sans-arabic.woff2"]);
    expect(read("../static/fonts/LICENSE.txt")).not.toMatch(/Plex|Naskh/);
  });
  it("no Carnet colour, font or ruled-paper rule is left in the phone's style files", () => {
    for (const f of ["app.css", "orders.css", "inbox.css"]) {
      const css = read(`../src/styles/${f}`);
      expect(css, f).not.toMatch(/#[0-9A-Fa-f]{3,8}\b|repeating-linear-gradient|Naskh|Plex|--paper|--sheet|--ink|--rule|--brass|CARNET/i);
    }
  });
  it("covers every look in the picker with a dot colour", () => {
    const css = read("../src/styles/looks.css");
    for (const m of MODES) for (const l of LOOKS) expect(css, `${l} ${m}`).toContain(`--sw-${l}:`);
  });
});
