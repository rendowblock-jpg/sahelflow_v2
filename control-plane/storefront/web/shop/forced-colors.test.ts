import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Windows High Contrast (forced-colors: active) drops background colours and
 * shadows. The public storefront draws its selected size/colour chip, its
 * delivery-mode card and the edges of its buttons with exactly those, and its
 * order fields remove the outline on :focus in favour of a shadow. Without a
 * forced-colors block a customer in High Contrast cannot see where the focus
 * is or which option is selected. These pins read every storefront stylesheet
 * and keep one block in the shared base sheet (shop.css) that puts borders and
 * outlines back in system colours. The dashboard has the same pin in
 * src/app/__tests__/forced-colors-focus-contract.test.ts.
 */

const STYLES_DIR = join(process.cwd(), "control-plane/storefront/web/styles");

type Rule = { selector: string; body: string; forced: boolean };

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

// Small brace-matching reader: enough for plain (minified) CSS with nested at-rules.
function readRules(css: string, forced = false): Rule[] {
  const rules: Rule[] = [];
  let i = 0;
  while (i < css.length) {
    let j = i;
    while (j < css.length && !"{;}".includes(css[j]!)) j++;
    const prelude = css.slice(i, j).trim();
    if (j >= css.length || css[j] !== "{") {
      i = j + 1; // `@import ...;` or stray `}`
      continue;
    }
    let depth = 1;
    let k = j + 1;
    while (k < css.length && depth > 0) {
      if (css[k] === "{") depth++;
      else if (css[k] === "}") depth--;
      k++;
    }
    const body = css.slice(j + 1, k - 1);
    if (/^@(media|supports)\b/.test(prelude)) {
      rules.push(...readRules(body, forced || /^@media[^{]*forced-colors:\s*active/.test(prelude)));
    } else if (!prelude.startsWith("@")) {
      rules.push({ selector: prelude.replace(/\s+/g, " "), body, forced });
    }
    i = k;
  }
  return rules;
}

const sheets = readdirSync(STYLES_DIR)
  .filter((name) => name.endsWith(".css"))
  .map((name) => ({ name, rules: readRules(stripComments(readFileSync(join(STYLES_DIR, name), "utf8"))) }));

const parts = (selector: string) => selector.split(",").map((part) => part.trim());
const allRules = sheets.flatMap((sheet) => sheet.rules);
const forcedRules = sheets.find((sheet) => sheet.name === "shop.css")?.rules.filter((rule) => rule.forced) ?? [];
const forcedSelectors = forcedRules.flatMap((rule) => parts(rule.selector));

/** The forced-colors rules whose selector list contains `selector` (exact entry). */
const forcedFor = (selector: string) => forcedRules.filter((rule) => parts(rule.selector).includes(selector));

describe("storefront forced-colors (Windows High Contrast)", () => {
  it("reads every storefront stylesheet, shared base included", () => {
    expect(sheets.map((sheet) => sheet.name)).toContain("shop.css");
    expect(sheets.length).toBeGreaterThanOrEqual(9);
  });

  it("keeps ONE forced-colors block, in the shared base stylesheet", () => {
    const source = stripComments(readFileSync(join(STYLES_DIR, "shop.css"), "utf8"));
    expect(source.match(/@media[^{]*forced-colors:\s*active/g) ?? []).toHaveLength(1);
    for (const sheet of sheets.filter((candidate) => candidate.name !== "shop.css")) {
      expect(sheet.rules.some((rule) => rule.forced), `${sheet.name} has no block of its own`).toBe(false);
    }
  });

  it("gives focus a real 2px+ outline in a system colour on links, buttons and fields", () => {
    for (const selector of [
      ":focus-visible",
      ".sf-field input:focus",
      ".sf-field select:focus",
      ".sf-field textarea:focus",
      ".sf-pill input:focus-visible+span",
      ".sf-mode input:focus-visible+.sf-mode-in",
    ]) {
      const rule = forcedFor(selector)[0];
      expect(rule, `forced-colors rule for ${selector}`).toBeDefined();
      const outline = /outline:\s*(\d+(?:\.\d+)?)px\s+solid\s+(Highlight|CanvasText)\b/.exec(rule!.body);
      expect(outline, `${selector}: outline: Npx solid Highlight|CanvasText`).not.toBeNull();
      expect(Number(outline![1])).toBeGreaterThanOrEqual(2);
    }
  });

  it("restores the outline on every rule that switches it off for focus", () => {
    const switchedOff = allRules.filter(
      (rule) => !rule.forced && /:focus/.test(rule.selector) && /outline:\s*(none|0)\b/.test(rule.body),
    );
    expect(switchedOff.length).toBeGreaterThan(0);
    for (const rule of switchedOff) {
      for (const selector of parts(rule.selector)) {
        expect(forcedSelectors, `forced-colors restore for ${selector}`).toContain(selector);
      }
    }
  });

  it("draws a ButtonText border on buttons, quantity controls, chips and fields", () => {
    for (const selector of [
      ".sf-btn",
      ".sf-cta",
      ".sf-stepper button",
      ".sf-chips span",
      ".sf-chip",
      ".sf-field input",
      ".sf-field select",
      ".sf-field textarea",
      ".sf-stepper",
      ".sf-pill span",
      ".sf-mode-in",
    ]) {
      const rule = forcedFor(selector)[0];
      expect(rule, `forced-colors rule for ${selector}`).toBeDefined();
      expect(rule!.body, selector).toMatch(/border:\s*\d+(?:\.\d+)?px\s+solid\s+ButtonText\b/);
    }
  });

  it("marks the selected size/colour chip and delivery mode with a thicker Highlight border, not colour alone", () => {
    for (const marker of ["input:checked+span", "input:checked+.sf-mode-in"]) {
      const rule = forcedRules.find((candidate) => parts(candidate.selector).some((selector) => selector.includes(marker)));
      expect(rule, `forced-colors rule for ${marker}`).toBeDefined();
      const border = /border:\s*(\d+(?:\.\d+)?)px\s+solid\s+Highlight\b/.exec(rule!.body);
      expect(border, `${marker}: border: Npx solid Highlight`).not.toBeNull();
      // The unselected chip and card have a 1.5px border: a clearly thicker one is a shape cue.
      expect(Number(border![1])).toBeGreaterThanOrEqual(3);
    }
  });

  it("relies on no background image (the shine sweep on the order button is hidden)", () => {
    for (const rule of forcedRules) {
      expect(rule.body, rule.selector).not.toMatch(/url\(|gradient\(/);
    }
    const shine = forcedFor(".sf-cta::after")[0];
    expect(shine, "forced-colors rule for .sf-cta::after").toBeDefined();
    expect(shine!.body).toMatch(/display:\s*none/);
  });
});
