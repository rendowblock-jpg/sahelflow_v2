/**
 * Contract: a heading that truncates keeps ONE line in the Arabic UI and has room for Arabic marks.
 *
 * Why (s42 sweep, class text-cut, 26 hits, all in ar cells): arabic-system.css sets `text-wrap: balance` on every
 * html[dir="rtl"] h1-h4. `text-wrap` is the shorthand of text-wrap-mode, and an unlayered rule beats the layered
 * Tailwind utility, so `.truncate` (white-space: nowrap) lost its nowrap: the inbox title, the store-card title and the
 * inbox names WRAPPED instead of ending in an ellipsis (a store-card title became 3 lines in a box sized for them).
 * Second, Noto Sans Arabic has a 1.7 em content area but headings get a 1.42 line box, so shadda/kasra stacks at 15 px
 * can reach 0.7 px past the clip edge (measured with the ink probe, audit/program/ui/ink-probe.mjs); the fix grows the
 * clip box by 0.12 em on both sides and cancels it with the same negative margin, so no layout moves.
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

  it("grows the clip box by a font-relative amount and cancels it with the same negative margin (no layout shift)", () => {
    const rules = block();
    const pad = rules.match(/padding-block:\s*(0?\.\d+)em/);
    const mar = rules.match(/margin-block:\s*-(0?\.\d+)em/);
    expect(pad, "padding-block in em").not.toBeNull();
    expect(mar, "margin-block negative in em").not.toBeNull();
    expect(pad![1]).toBe(mar![1]);
    expect(Number(pad![1])).toBeGreaterThanOrEqual(0.1);
  });

  it("is top-level CSS (a layered rule would lose to the unlayered balance rule it corrects)", () => {
    const before = css.slice(0, css.indexOf("/* sf:arabic-truncate:start */"));
    expect((before.match(/\{/g) ?? []).length - (before.match(/\}/g) ?? []).length).toBe(0);
  });

  it("only touches the Arabic UI", () => {
    for (const selector of block().match(/[^{}]+(?=\{)/g) ?? []) expect(selector).toContain('html[dir="rtl"]');
  });
});
