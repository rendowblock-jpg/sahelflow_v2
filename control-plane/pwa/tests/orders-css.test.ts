// W3-F4 step 5: the style rules the brief promises, checked on the text of orders.css (not seen in a browser).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../src/styles/orders.css", import.meta.url), "utf8");
const build = readFileSync(new URL("../build.mjs", import.meta.url), "utf8");

describe("orders.css", () => {
  it("uses logical properties only", () => expect(css).not.toMatch(/(margin|padding|border)-(left|right)|[^-\w](left|right)\s*:|text-align\s*:\s*(left|right)|float\s*:/));
  it("every text size is at least 16 px", () => { const sizes = [...css.matchAll(/font-size\s*:\s*(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1])); expect(sizes.length).toBeGreaterThan(0); for (const s of sizes) expect(s).toBeGreaterThanOrEqual(16); });
  it("rows, filters and buttons are at least 44 px tall", () => { for (const sel of [".orders .row-main", ".orders .filter", ".orders .btn"]) { const m = css.match(new RegExp(`${sel.replace(/[.]/g, "\\.")}[^{]*\\{[^}]*min-block-size\\s*:\\s*(\\d+)px`)); expect(m, sel).not.toBeNull(); expect(Number(m?.[1])).toBeGreaterThanOrEqual(44); } });
  it("forces numbers left-to-right and allows no sideways scroll", () => { expect(css).toMatch(/unicode-bidi\s*:\s*isolate/); expect(css).toMatch(/overflow-wrap\s*:\s*anywhere/); expect(css).not.toMatch(/overflow-x\s*:\s*(scroll|auto)/); });
  it("is part of the build", () => expect(build).toContain("orders.css"));
  it("status chips keep 4.5:1 text contrast", () => {
    const lum = (hex: string): number => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * (c[0] ?? 0) + 0.7152 * (c[1] ?? 0) + 0.0722 * (c[2] ?? 0); };
    for (const cls of ["pending", "confirmed", "cancelled", "other"]) {
      const m = css.match(new RegExp(`\\.st-${cls}[^{]*\\{[^}]*background:(#[0-9A-Fa-f]{6});[^}]*color:(#[0-9A-Fa-f]{6})`)); expect(m, cls).not.toBeNull();
      const [hi, lo] = [lum(m?.[1] ?? "#000000"), lum(m?.[2] ?? "#000000")].sort((a, b) => b - a); expect(((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05), cls).toBeGreaterThanOrEqual(4.5);
    }
  });
});
