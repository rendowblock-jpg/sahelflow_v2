/**
 * Contract: Arabic script is never letter-spaced, whatever the UI language.
 *
 * Reads the CSS and the components as text, so the rule cannot slip back unnoticed.
 * The render proof is user-text.render.test.tsx; the browser proof is the page sweep
 * (audit/program/ui/sweep.mjs, class arabic-letter-spacing, all routes, 8 cells).
 *
 * Why two layers:
 *  1. CSS (unlayered, !important, so it also beats a tracking-* utility on the same element):
 *     - `[lang|="ar"]` : any element the code tags as Arabic (UserText does);
 *     - `bdi` / `[dir="auto"]` whose content resolves right-to-left (`:dir(rtl)`): the
 *       data fragments that already carry bidi isolation, with no change to the markup.
 *  2. Markup: DATA drawn inside a tracked heading goes through `UserText`, which tags each
 *     Arabic run lang="ar" and leaves Latin text (and its heading tracking) alone. A data
 *     string that starts with Latin and holds an Arabic part ("Parfum oud عطر") resolves LTR,
 *     so `:dir(rtl)` alone cannot catch it: that is why the markup layer exists.
 * No MutationObserver and no DOM scan: one regex per heading render, one CSS rule.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const withoutComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "");

function block(css: string): string {
  const start = css.indexOf("/* sf:arabic-letter-spacing:start */");
  const end = css.indexOf("/* sf:arabic-letter-spacing:end */");
  expect(start, "marker sf:arabic-letter-spacing:start in arabic-system.css").toBeGreaterThan(-1);
  expect(end, "marker sf:arabic-letter-spacing:end in arabic-system.css").toBeGreaterThan(start);
  return withoutComments(css.slice(start, end));
}

describe("CSS: letter-spacing is reset for Arabic script in every UI language", () => {
  const css = read("src/app/arabic-system.css");

  it("has a marked block with a [lang|=ar] rule that does not depend on html[dir]", () => {
    const rules = block(css);
    expect(rules).toMatch(/\[lang\|="ar"\]:not\(html\)[^{]*\{[^}]*letter-spacing:\s*normal\s*!important/);
    // html[dir=rtl] is exactly the condition that left the English UI uncovered.
    expect(rules).not.toMatch(/html\[dir/);
  });

  it("covers bdi and dir=auto fragments that resolve right-to-left", () => {
    const rules = block(css);
    expect(rules).toMatch(/bdi[^{]*:dir\(rtl\)[^{]*\{[^}]*letter-spacing:\s*normal\s*!important/s);
    expect(rules).toMatch(/\[dir="auto"\][^{]*:dir\(rtl\)/);
  });

  it("is top-level CSS, not inside an @layer (a layered rule loses to unlayered ones and to utilities)", () => {
    const before = css.slice(0, css.indexOf("/* sf:arabic-letter-spacing:start */"));
    const open = (before.match(/\{/g) ?? []).length;
    const close = (before.match(/\}/g) ?? []).length;
    expect(open - close).toBe(0);
  });

  it("the Arabic UI rules stay (this block adds to them, it does not replace them)", () => {
    expect(read("src/app/globals.css")).toMatch(/html\[dir="rtl"\] :where\(:dir\(rtl\)\)\s*\{\s*letter-spacing:\s*normal\s*!important/);
    expect(css).toMatch(/html\[dir="rtl"\] :is\(h1, h2, h3, h4\)\s*\{[^}]*letter-spacing:\s*normal\s*!important/);
  });
});

describe("UserText", () => {
  const source = withoutComments(read("src/components/i18n/user-text.tsx"));

  it("tags Arabic runs with lang=ar and carries no locale hook (usable from server components)", () => {
    expect(source).toContain('lang="ar"');
    expect(source).not.toContain("useI18n");
    expect(source).not.toContain('"use client"');
  });

  it("does not observe or scan the DOM", () => {
    expect(source).not.toMatch(/MutationObserver|querySelectorAll|useEffect|useLayoutEffect/);
  });
});

/** Data that a seller or a buyer typed, drawn inside a heading whose style tracks letters. */
const SITES: Array<[file: string, pattern: RegExp, minCount: number]> = [
  ["src/components/shared/page-header.tsx", /<UserText text=\{title\} \/>/, 1],
  ["src/components/storefront/storefront-hero.tsx", /<UserText text=\{headline\} \/>/, 2],
  ["src/components/storefront/storefront-hero.tsx", /<UserText text=\{eyebrow\} \/>/, 2],
  ["src/components/storefront/storefront-parts.tsx", /<UserText text=\{title\} \/>/, 1],
  ["src/components/storefront/storefront-parts.tsx", /<UserText text=\{eyebrow\} \/>/, 1],
  ["src/components/storefront/storefront-renderer.tsx", /<UserText text=\{title\} \/>/, 1],
  ["src/components/storefront/storefront-renderer.tsx", /<UserText text=\{eyebrow\} \/>/, 1],
  ["src/components/storefront/storefront-card.tsx", /<UserText text=\{config\.name\} \/>/, 1],
  ["src/components/storefront/landing-page-view.tsx", /<UserText text=\{page\.product\.name\} \/>/, 1],
  ["src/components/automations/automation-card.tsx", /<UserText text=\{data\.name\} \/>/, 2],
  ["src/components/automations/automation-builder.tsx", /<UserText text=\{automation\.name\} \/>/, 1],
];

describe("user data inside tracked headings goes through UserText", () => {
  it.each(SITES)("%s draws %s", (file, pattern, minCount) => {
    const matches = read(file).match(new RegExp(pattern.source, "g")) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(minCount);
    expect(read(file)).toContain('@/components/i18n/user-text');
  });
});
