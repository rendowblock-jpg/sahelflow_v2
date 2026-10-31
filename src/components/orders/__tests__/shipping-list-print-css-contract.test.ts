import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "src/components/orders/shipping-list-print.css"), "utf8");
const tsx = readFileSync(resolve(process.cwd(), "src/components/orders/shipping-list-print.tsx"), "utf8");

describe("shipping list print stylesheet contract", () => {
  it("only styles the sheet for paper: a print media query, A4 portrait, 12 mm margins", () => {
    expect(css).toContain("@media print");
    expect(css).toMatch(/@page\s*{[^}]*size:\s*A4 portrait/);
    expect(css).toMatch(/@page\s*{[^}]*margin:\s*12mm/);
  });

  it("repeats the header row on every page and never splits a row", () => {
    expect(css).toMatch(/thead\s*{\s*display:\s*table-header-group/);
    expect(css).toMatch(/tr\s*{[^}]*(page-break-inside|break-inside):\s*avoid/);
  });

  it("does not let the totals footer repeat on every page", () => {
    expect(css).not.toMatch(/tfoot\s*{[^}]*table-footer-group/);
  });

  it("hides the rest of the app while this sheet prints", () => {
    expect(css).toMatch(/body\.sf-shipping-list-printing\s*>\s*\*:not\(\.sf-shipping-list-root\)\s*{\s*display:\s*none\s*!important/);
  });

  it("is ink only: no tint, no shadow, no gradient, 2 px radii at most", () => {
    expect(css).not.toMatch(/box-shadow\s*:\s*(?!none)/);
    expect(css).not.toMatch(/text-shadow\s*:\s*(?!none)/);
    expect(css).not.toMatch(/gradient\(/);
    expect(css).not.toMatch(/background(-color)?\s*:\s*(?=\S)(?!#fff\b|#ffffff\b|white\b|transparent\b|none\b)/i);
    const radii = Array.from(css.matchAll(/border-radius\s*:\s*(\d+)px/g)).map((m) => Number(m[1]));
    expect(radii.every((r) => r <= 2)).toBe(true);
  });

  it("puts the double margin rule on the side where the text ends, not a physical left", () => {
    expect(css).toMatch(/border-inline-end:\s*[\d.]+px double/);
    expect(css).not.toMatch(/border-left|border-right|margin-left|margin-right|padding-left|padding-right/);
  });

  it("is imported by the component and does not touch the shared product stylesheet", () => {
    expect(tsx).toContain('import "./shipping-list-print.css"');
    expect(tsx).toContain("createPortal");
    expect(tsx).toContain('"sf-shipping-list-root hidden print:block"');
    expect(tsx).not.toContain("product-system");
  });
});
