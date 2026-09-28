/**
 * Seller-named labels (customer, product and agent names, session titles) keep
 * their own direction but align with the interface. The first version used
 * `text-align: match-parent`, which the CSS pipeline silently dropped — the
 * rule compiled to an empty block and Latin names still drifted to the wrong
 * edge in Arabic. This pins the explicit form that survives compilation.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "src/app/experience-system.css"), "utf8");

describe("seller label alignment", () => {
  it("aligns seller labels to the interface edge with rules the pipeline keeps", () => {
    expect(css).toMatch(
      /html\[dir="rtl"\] \[data-sf-seller-label="true"\] \{\s*text-align: right;\s*\}/,
    );
    expect(css).toMatch(
      /html\[dir="ltr"\] \[data-sf-seller-label="true"\] \{\s*text-align: left;\s*\}/,
    );
  });

  it("never relies on values the CSS pipeline drops", () => {
    expect(css).not.toMatch(/text-align:\s*match-parent/);
  });
});
