import { existsSync, readFileSync, statSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * The Carnet identity layer (type, figures, ruled-page primitives) lives in ONE stylesheet, scoped to
 * html[data-theme-preset="carnet"]. These tests read the stylesheet and the font files as text/bytes.
 */

const SCOPE = 'html[data-theme-preset="carnet"]';
const DARK_SCOPE = 'html.dark[data-theme-preset="carnet"]';
const FONT_DIR = new URL("../fonts/", import.meta.url);
const NEW_FONTS = [
  "ibmplexsansarabic-400-arabic.woff2",
  "ibmplexsansarabic-400-latin.woff2",
  "ibmplexsansarabic-600-arabic.woff2",
  "amiri-700-arabic.woff2",
] as const;
const FONT_BUDGET_BYTES = 215_000;

type Rule = { atrules: string[]; selectors: string[]; body: string };

function text(relative: string): string {
  return readFileSync(new URL(relative, import.meta.url), "utf8");
}

function identityCss(): string {
  return text("../carnet-identity.css");
}

/** Small nested-aware CSS reader: comments stripped, at-rule preludes kept for every inner rule. */
function parseRules(css: string): Rule[] {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules: Rule[] = [];
  const stack: { prelude: string; start: number }[] = [];
  let mark = 0;
  for (let index = 0; index < source.length; index += 1) {
    const char = source.charAt(index);
    if (char === "{") {
      stack.push({ prelude: source.slice(mark, index).trim(), start: index + 1 });
      mark = index + 1;
    } else if (char === "}") {
      const frame = stack.pop();
      if (frame && !frame.prelude.startsWith("@")) {
        rules.push({
          atrules: stack.filter((entry) => entry.prelude.startsWith("@")).map((entry) => entry.prelude),
          selectors: frame.prelude.split(",").map((selector) => selector.trim()).filter(Boolean),
          body: source.slice(frame.start, index),
        });
      }
      mark = index + 1;
    } else if (char === ";" && (stack.length === 0 || stack[stack.length - 1]?.prelude.startsWith("@"))) {
      mark = index + 1;
    }
  }
  return rules;
}

function declaration(rule: Rule, property: string): string | undefined {
  const match = new RegExp(`(?:^|[;\\s])${property}\\s*:\\s*([^;]+)`).exec(rule.body);
  return match?.[1]?.trim();
}

function families(value: string | undefined): string[] {
  return (value ?? "").split(",").map((entry) => entry.trim()).filter(Boolean);
}

function rulesFor(selectorPart: string): Rule[] {
  return parseRules(identityCss()).filter((rule) => rule.selectors.some((selector) => selector.includes(selectorPart)));
}

const PRIMITIVES = [".carnet-ruled", ".carnet-margin", ".carnet-stamp", ".carnet-total", ".carnet-index-letter"] as const;
const PHYSICAL = /(?:^|[;\s{])(?:left|right|margin-left|margin-right|padding-left|padding-right|border-left|border-right|border-top-left-radius|border-top-right-radius)\s*:/;

describe("carnet type: Plex Sans Arabic leads, Amiri only for display words", () => {
  it("ships the four font files and stays under the byte budget", () => {
    const sizes = NEW_FONTS.map((file) => {
      expect(existsSync(new URL(file, FONT_DIR)), `${file} exists`).toBe(true);
      return statSync(new URL(file, FONT_DIR)).size;
    });
    for (const size of sizes) expect(size).toBeGreaterThan(5_000);
    expect(sizes.reduce((sum, size) => sum + size, 0)).toBeLessThan(FONT_BUDGET_BYTES);
  });

  it("ships a real SIL OFL text for each family", () => {
    const plex = text("../../../src-tauri/licenses/IBMPlexSansArabic-OFL.txt");
    expect(plex).toContain("SIL OPEN FONT LICENSE Version 1.1");
    expect(plex).toContain("Copyright © 2017 IBM Corp.");
    const amiri = text("../../../src-tauri/licenses/Amiri-OFL.txt");
    expect(amiri).toContain("SIL OPEN FONT LICENSE Version 1.1");
    expect(amiri).toContain("The Amiri Project Authors");
  });

  it("loads the faces with next/font/local and exposes both variables on <html>", () => {
    const layout = text("../layout.tsx");
    for (const file of NEW_FONTS) expect(layout).toContain(`./fonts/${file}`);
    expect(layout).toContain('variable: "--font-plex-arabic"');
    expect(layout).toContain('variable: "--font-amiri"');
    const htmlTag = layout.slice(layout.indexOf("<html"), layout.indexOf("<head>"));
    expect(htmlTag).toContain("plexMono.variable");
    expect(htmlTag).toContain("plexArabic.variable");
    expect(htmlTag).toContain("amiri.variable");
  });

  it("puts Plex Sans Arabic first in the carnet UI stack and keeps a sans fallback chain", () => {
    const bodyRules = parseRules(identityCss()).filter((rule) =>
      rule.selectors.some((selector) => selector === `${SCOPE} body` || selector === `${SCOPE}[dir="rtl"] body`),
    );
    expect(bodyRules.length).toBeGreaterThan(0);
    for (const rule of bodyRules) {
      const stack = families(declaration(rule, "font-family"));
      expect(stack[0]).toBe("var(--font-plex-arabic)");
      expect(stack).toContain('"Noto Sans Arabic"');
      expect(stack).toContain('"Segoe UI"');
      expect(stack).toContain("Tahoma");
      expect(stack[stack.length - 1]).toBe("sans-serif");
      expect(stack).not.toContain("serif");
      expect(stack.join(",")).not.toContain("amiri");
    }
  });

  it("uses Amiri only on display selectors and always with a sans fallback", () => {
    const allowed = [".carnet-display", "main h1", ".carnet-stamp", ".carnet-index-letter", "[data-nav-group-header]"];
    const amiriRules = parseRules(identityCss()).filter((rule) => (declaration(rule, "font-family") ?? "").includes("--font-amiri"));
    expect(amiriRules.length).toBeGreaterThan(0);
    for (const rule of amiriRules) {
      expect(rule.selectors.every((selector) => allowed.some((part) => selector.includes(part))), rule.selectors.join(" | ")).toBe(true);
      const stack = families(declaration(rule, "font-family"));
      expect(stack[0]).toBe("var(--font-amiri)");
      expect(stack).toContain("var(--font-plex-arabic)");
      expect(stack[stack.length - 1]).toBe("sans-serif");
    }
  });

  it("sets main h1 at 22px / 700 and defines the .carnet-display utility", () => {
    const h1 = rulesFor(`${SCOPE} main h1`)[0];
    expect(h1).toBeDefined();
    if (h1) {
      expect(declaration(h1, "font-size")).toBe("22px");
      expect(declaration(h1, "font-weight")).toBe("700");
    }
    expect(rulesFor(`${SCOPE} .carnet-display`).length).toBeGreaterThan(0);
  });

  it("leaves every other preset on its current fonts", () => {
    const layout = text("../layout.tsx");
    expect(layout).toContain("./fonts/inter-latin-wght-normal.woff2");
    expect(layout).toContain("./fonts/noto-sans-arabic-arabic-wght-normal.woff2");
    expect(text("../globals.css")).toContain("--font-sans: var(--font-inter), ui-sans-serif, system-ui, sans-serif;");
    expect(text("../arabic-system.css")).toContain('var(--font-arabic),\n    "Noto Sans Arabic"');
    for (const file of ["globals.css", "arabic-system.css", "product-system.css", "theme-preset-system.css", "responsive-system.css"]) {
      const css = text(`../${file}`);
      expect(css, file).not.toContain("--font-plex-arabic");
      expect(css, file).not.toContain("--font-amiri");
    }
  });

  it("scopes every rule of the identity stylesheet to the carnet preset", () => {
    const rules = parseRules(identityCss());
    expect(rules.length).toBeGreaterThan(10);
    for (const rule of rules) {
      if (rule.atrules.some((entry) => entry.startsWith("@keyframes"))) continue;
      for (const selector of rule.selectors) {
        expect(selector.startsWith(SCOPE) || selector.startsWith(DARK_SCOPE), selector).toBe(true);
      }
    }
  });
});

describe("carnet figures: the existing hooks map to Plex Mono with tabular numerals", () => {
  const HOOKS = [".numeric-value", ".technical-value", ".font-mono", "code", "kbd", ".tabular-nums", ".nums"];

  it("maps every shared figure hook, under carnet only", () => {
    const rules = parseRules(identityCss());
    for (const hook of HOOKS) {
      const rule = rules.find((entry) => entry.selectors.includes(`${SCOPE} ${hook}`));
      expect(rule, `${hook} is mapped`).toBeDefined();
      if (!rule) continue;
      expect(families(declaration(rule, "font-family"))).toContain("var(--sf-font-mono)");
      expect(declaration(rule, "font-variant-numeric")).toContain("tabular-nums");
    }
  });

  it("keeps Latin digits and does not switch the digit script", () => {
    const css = identityCss();
    expect(css).not.toMatch(/arab-indic|font-feature-settings:\s*"?(?:locl|ss0)/i);
  });
});

describe("carnet primitives: ruled page, margin, stamp, total, index letter", () => {
  it("defines every primitive, only under the carnet selector", () => {
    const rules = parseRules(identityCss());
    for (const primitive of PRIMITIVES) {
      const own = rules.filter((rule) => rule.selectors.some((selector) => selector.includes(primitive)));
      expect(own.length, primitive).toBeGreaterThan(0);
      for (const rule of own) {
        for (const selector of rule.selectors.filter((entry) => entry.includes(primitive))) {
          expect(selector.startsWith(`${SCOPE} `), selector).toBe(true);
        }
      }
    }
    for (const file of ["globals.css", "product-system.css", "theme-preset-system.css", "arabic-system.css", "responsive-system.css", "workspace-system.css", "experience-system.css"]) {
      expect(text(`../${file}`), file).not.toContain(".carnet-");
    }
  });

  it("uses logical properties only (no left/right, no margin-left, no padding-right)", () => {
    for (const rule of parseRules(identityCss())) {
      expect(PHYSICAL.test(rule.body), `${rule.selectors.join(", ")}: ${rule.body.trim().slice(0, 60)}`).toBe(false);
    }
    const margin = rulesFor(".carnet-margin").find((rule) => rule.selectors.some((selector) => selector.includes("::")));
    expect(margin).toBeDefined();
    if (margin) {
      expect(declaration(margin, "inset-inline-start")).toBe("0");
      expect(declaration(margin, "pointer-events")).toBe("none");
      expect(declaration(margin, "border-inline")).toContain("var(--carnet-margin)");
    }
  });

  it("draws the ruled page with a 32px repeating gradient on --carnet-rule and no image", () => {
    const ruled = rulesFor(".carnet-ruled")[0];
    expect(ruled).toBeDefined();
    if (!ruled) return;
    const image = declaration(ruled, "background-image") ?? "";
    expect(image).toContain("repeating-linear-gradient");
    expect(image).toContain("var(--carnet-rule)");
    expect(image).toContain("32px");
    expect(image).not.toContain("url(");
    expect(declaration(ruled, "background-color")).toBe("var(--background)");
  });

  it("rotates the stamp -3deg with a double border and animates only behind prefers-reduced-motion", () => {
    const stamp = rulesFor(".carnet-stamp").find((rule) => rule.atrules.length === 0);
    expect(stamp).toBeDefined();
    if (stamp) {
      expect(declaration(stamp, "transform")).toBe("rotate(-3deg)");
      expect(declaration(stamp, "border")).toMatch(/double\s+var\(--carnet-red\)/);
    }
    const css = parseRules(identityCss());
    const animated = css.filter((rule) => /animation|transition/.test(rule.body));
    expect(animated.length).toBeGreaterThan(0);
    for (const rule of animated) {
      expect(rule.atrules.some((entry) => entry.includes("prefers-reduced-motion: no-preference")), rule.selectors.join(", ")).toBe(true);
    }
    const run = animated.find((rule) => rule.selectors.some((selector) => selector.includes(".carnet-stamp")));
    expect(declaration(run as Rule, "animation")).toContain("180ms");
    const steps = css.filter((rule) => rule.atrules.some((entry) => entry.startsWith("@keyframes carnet-stamp-in")));
    expect(steps.length).toBe(2);
    for (const step of steps) {
      expect(step.body.match(/[\w-]+\s*:/g)?.map((entry) => entry.replace(/\s*:$/, "")).sort()).toEqual(["opacity", "transform"]);
    }
  });

  it("puts a double rule above a total and sets the index letter in Amiri", () => {
    const total = rulesFor(".carnet-total")[0];
    expect(total && declaration(total, "border-block-start")).toMatch(/double/);
    const letter = rulesFor(".carnet-index-letter")[0];
    expect(letter && declaration(letter, "font-family")).toContain("var(--font-amiri)");
    expect(letter && declaration(letter, "border-radius")).toBe("50%");
  });
});
