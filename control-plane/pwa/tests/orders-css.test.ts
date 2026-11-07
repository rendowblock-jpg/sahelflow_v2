// W3-F4 step 5: the style rules the brief promises, checked on the text of orders.css (not seen in a browser).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readDesktop } from "../tools/gen-looks.mjs";
import { buildLooks, contrast } from "../tools/looks.mjs";

const css = readFileSync(new URL("../src/styles/orders.css", import.meta.url), "utf8");
const build = readFileSync(new URL("../build.mjs", import.meta.url), "utf8");

describe("orders.css", () => {
  it("uses logical properties only", () => expect(css).not.toMatch(/(margin|padding|border)-(left|right)|[^-\w](left|right)\s*:|text-align\s*:\s*(left|right)|float\s*:/));
  it("every text size is at least 16 px", () => { const sizes = [...css.matchAll(/font-size\s*:\s*(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1])); expect(sizes.length).toBeGreaterThan(0); for (const s of sizes) expect(s).toBeGreaterThanOrEqual(16); });
  it("rows, filters and buttons are at least 44 px tall", () => { for (const sel of [".orders .row-main", ".orders .filter", ".orders .btn", ".orders .facts a"]) { const m = css.match(new RegExp(`${sel.replace(/[.]/g, "\\.")}[^{]*\\{[^}]*min-block-size\\s*:\\s*(\\d+)px`)); expect(m, sel).not.toBeNull(); expect(Number(m?.[1])).toBeGreaterThanOrEqual(44); } });
  it("forces numbers left-to-right and allows no sideways scroll", () => { expect(css).toMatch(/unicode-bidi\s*:\s*isolate/); expect(css).toMatch(/overflow-wrap\s*:\s*anywhere/); expect(css).not.toMatch(/overflow-x\s*:\s*(scroll|auto)/); });
  it("is part of the build", () => expect(build).toContain("orders.css"));
  it("status chips are painted with tokens only and keep 4.5:1 text contrast in all 4 looks, light and dark", () => {
    const L = buildLooks(readDesktop());
    const want: Record<string, [string, string]> = { pending: ["warning-tint", "warning-ink"], confirmed: ["success-tint", "success-ink"], cancelled: ["destructive-tint", "destructive-ink"], other: ["muted", "foreground"] };
    for (const [cls, [bg, fg]] of Object.entries(want)) {
      const m = css.match(new RegExp(`\\.st-${cls}[^{]*\\{[^}]*background:var\\(--([\\w-]+)\\);[^}]*color:var\\(--([\\w-]+)\\)`)); expect(m, cls).not.toBeNull();
      expect([m?.[1], m?.[2]], cls).toEqual([bg, fg]);
      for (const [k, t] of Object.entries(L)) expect(contrast(t[fg] ?? "#000000", t[bg] ?? "#000000"), `${cls} ${k}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
