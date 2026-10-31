/**
 * 31 Oct 2026 (w204): link tabs (a[role="tab"]) get the 44 px touch floor ONLY under (pointer: coarse),
 * so a mouse keeps the 28 px tab; a placeholder longer than its field ends in an ellipsis (on the input, see the last block).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** The block headers around a position, outermost first. */
function enclosing(source: string, index: number): string[] {
  const stack: string[] = [];
  let start = 0;
  for (let i = 0; i < index; i++) {
    const ch = source[i];
    if (ch === "{") {
      stack.push(source.slice(start, i).trim());
      start = i + 1;
    } else if (ch === "}") {
      stack.pop();
      start = i + 1;
    } else if (ch === ";") {
      start = i + 1;
    }
  }
  return stack;
}

function positions(source: string, needle: string): number[] {
  const out: number[] = [];
  for (let i = source.indexOf(needle); i !== -1; i = source.indexOf(needle, i + 1)) out.push(i);
  return out;
}

describe("link tabs on a finger", () => {
  const found = positions(css, 'a[role="tab"]');

  it("names a[role=tab] exactly once, inside the coarse-pointer block", () => {
    expect(found).toHaveLength(1);
    const blocks = enclosing(css, found[0] ?? 0);
    expect(blocks.some((h) => /^@media\s*\(pointer:\s*coarse\)$/.test(h))).toBe(true);
    expect(blocks.some((h) => /pointer:\s*fine/.test(h))).toBe(false);
  });

  it("sets the touch floor on it, together with the button selectors", () => {
    const at = found[0] ?? 0;
    const header = css.slice(css.lastIndexOf("{", at) + 1, css.indexOf("{", at));
    expect(header).toContain('button:not([data-size])');
    expect(header).toContain('[role="button"]:not([data-size])');
    const body = css.slice(css.indexOf("{", at), css.indexOf("}", at));
    expect(body).toContain("min-height: var(--touch-target)");
  });
});

describe("placeholder ellipsis", () => {
  // 31 Oct 2026, measured in Chromium 149 (probe of the Orders page): `text-overflow` written inside ::placeholder is ignored
  // (the computed value stays "clip" and the pixels do not change); it only works on the input itself. :placeholder-shown keeps
  // a typed value untouched.
  it("puts the ellipsis on the input while its placeholder is shown, for every viewport", () => {
    const rule = /input:placeholder-shown\s*\{[^}]*text-overflow:\s*ellipsis\s*;/.exec(css);
    expect(rule).not.toBeNull();
    const blocks = enclosing(css, rule?.index ?? 0);
    expect(blocks.some((h) => h.startsWith("@media"))).toBe(false);
  });

  it("does not rely on text-overflow inside ::placeholder, which Chromium ignores", () => {
    expect(/::placeholder\s*\{[^}]*text-overflow/.test(css)).toBe(false);
  });
});
