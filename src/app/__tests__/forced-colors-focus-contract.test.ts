import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Windows High Contrast (forced-colors: active) removes box-shadow, so a focus
 * ring drawn with a shadow disappears. The app-wide `*:focus-visible` rule
 * draws a real outline, which survives; what can break it is a later rule that
 * turns the outline off. These pins read the real stylesheets and keep one
 * forced-colors block that puts a real outline back.
 */

type Rule = { selector: string; body: string; forced: boolean; layered: boolean };

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

// Small brace-matching reader: enough for plain CSS plus Tailwind's at-rules.
function readRules(css: string, forced = false, layered = false): Rule[] {
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
    if (/^@(media|supports|layer)\b/.test(prelude)) {
      rules.push(
        ...readRules(
          body,
          forced || /^@media[^{]*forced-colors:\s*active/.test(prelude),
          layered || prelude.startsWith("@layer"),
        ),
      );
    } else if (!prelude.startsWith("@")) {
      rules.push({ selector: prelude.replace(/\s+/g, " "), body, forced, layered });
    }
    i = k;
  }
  return rules;
}

function allRules(): Rule[] {
  const dir = resolve(process.cwd(), "src/app");
  return readdirSync(dir)
    .filter((name) => name.endsWith(".css"))
    .flatMap((name) =>
      readRules(stripComments(readFileSync(resolve(dir, name), "utf8"))),
    );
}

const parts = (selector: string) =>
  selector.split(",").map((part) => part.trim().replace(/^:root /, ""));

describe("forced-colors focus outline", () => {
  const rules = allRules();
  const forcedRules = rules.filter((rule) => rule.forced);
  const forcedSelectors = forcedRules.flatMap((rule) => parts(rule.selector));

  it("has a forced-colors block that gives :focus-visible a real outline", () => {
    const rule = forcedRules.find((candidate) =>
      parts(candidate.selector).includes(":focus-visible"),
    );
    expect(rule, "a :focus-visible rule inside @media (forced-colors: active)").toBeDefined();
    const outline = /outline:\s*(\d+(?:\.\d+)?)px\s+solid\s+Highlight\b/.exec(rule!.body);
    expect(outline, "outline: Npx solid Highlight").not.toBeNull();
    expect(Number(outline![1])).toBeGreaterThanOrEqual(2);
    expect(rule!.body).toMatch(/outline-offset:\s*2px/);
  });

  it("restores the outline on every rule that turns it off for :focus-visible", () => {
    // A layered rule (Tailwind utilities) loses to the unlayered global
    // outline; an unlayered `outline: none` is what actually removes it.
    const switchedOff = rules.filter(
      (rule) =>
        !rule.forced &&
        !rule.layered &&
        /:focus-visible/.test(rule.selector) &&
        /outline:\s*(none|0)\b/.test(rule.body),
    );
    expect(switchedOff.length).toBeGreaterThan(0);
    for (const rule of switchedOff) {
      for (const selector of parts(rule.selector)) {
        expect(forcedSelectors, `forced-colors restore for ${selector}`).toContain(selector);
      }
    }
  });

  it("outranks the later stylesheet that switches the command field's outline off", () => {
    // experience-system.css loads after globals.css with the same specificity,
    // so the restore carries a `:root` prefix to win whatever the load order.
    const restore = forcedRules.find((rule) =>
      rule.selector.includes('[data-slot="command-input"]:focus-visible'),
    );
    expect(restore, "command input restore").toBeDefined();
    expect(restore!.selector).toContain(":root [data-universal-search=");
  });

  it("marks the selected command item with an outline (focus stays on the input)", () => {
    const item = forcedRules.find((rule) =>
      rule.selector.includes('[data-slot="command-item"][data-selected="true"]'),
    );
    expect(item, "selected command item rule").toBeDefined();
    expect(item!.body).toMatch(/outline:\s*2px\s+solid\s+Highlight/);
  });
});
