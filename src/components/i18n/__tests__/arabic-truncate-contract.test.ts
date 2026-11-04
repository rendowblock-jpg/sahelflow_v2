/**
 * Contract: a heading that truncates keeps ONE line in the Arabic UI and has room for Arabic marks.
 *
 * Why (s42 sweep, class text-cut, 26 hits, all in ar cells): arabic-system.css sets `text-wrap: balance` on every
 * html[dir="rtl"] h1-h4. `text-wrap` is the shorthand of text-wrap-mode, and an unlayered rule beats the layered
 * Tailwind utility, so `.truncate` (white-space: nowrap) lost its nowrap: the inbox title, the store-card title and the
 * inbox names WRAPPED instead of ending in an ellipsis (a store-card title became 3 lines in a box sized for them).
 * The "needs 26px, box 21px" figure itself is the font's 1.7 em content area, not clipped ink (ink probe,
 * audit/program/ui/ink-probe.mjs: 0.0 px cut for ordinary names, 0.7 px for stacked marks at 15 px), so no padding is added.
 *
 * The browser proof is the page sweep (text-cut, ar cells) and the ink probe; this file keeps the rule from slipping back.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "src/app/arabic-system.css"), "utf8");
const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "");

function block(): string {
  const start = css.indexOf("/* sf:arabic-truncate:start */");
  const end = css.indexOf("/* sf:arabic-truncate:end */");
  expect(start, "marker sf:arabic-truncate:start in arabic-system.css").toBeGreaterThan(-1);
  expect(end, "marker sf:arabic-truncate:end in arabic-system.css").toBeGreaterThan(start);
  return strip(css.slice(start, end));
}

describe("Arabic truncating headings", () => {
  it("balance does not undo nowrap: html[dir=rtl] headings with truncate / whitespace-nowrap get text-wrap: nowrap", () => {
    const rules = block();
    expect(rules).toMatch(/html\[dir="rtl"\]\s*:is\(h1,\s*h2,\s*h3,\s*h4\)\s*:is\([^)]*\.truncate[^)]*\.whitespace-nowrap[^)]*\)\s*\{[^}]*text-wrap:\s*nowrap/s);
  });

  it("the nowrap rule comes AFTER the balance rule (same specificity or lower would lose otherwise)", () => {
    expect(css.indexOf("text-wrap: balance")).toBeGreaterThan(-1);
    expect(css.indexOf("/* sf:arabic-truncate:start */")).toBeGreaterThan(css.indexOf("text-wrap: balance"));
  });

  it("does not set margin or padding on headings (an unlayered margin-block would beat every mt-* / py-* utility)", () => {
    expect(block()).not.toMatch(/(^|[;{\s])(margin|padding)[a-z-]*\s*:/);
  });

  it("is top-level CSS (a layered rule would lose to the unlayered balance rule it corrects)", () => {
    const before = css.slice(0, css.indexOf("/* sf:arabic-truncate:start */"));
    expect((before.match(/\{/g) ?? []).length - (before.match(/\}/g) ?? []).length).toBe(0);
  });

  it("only touches the Arabic UI", () => {
    for (const selector of block().match(/[^{}]+(?=\{)/g) ?? []) expect(selector).toContain('html[dir="rtl"]');
  });
});
