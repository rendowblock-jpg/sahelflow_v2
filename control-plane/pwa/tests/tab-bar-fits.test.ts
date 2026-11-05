// Phone app, bottom tab bar (F-0052, 5 Nov 2026).
// Measured on the lab pictures of the paired phone in Arabic at 360 px: three tabs sat on one row and "Settings" dropped to a
// second row, because the bar was a grid fixed at 3 columns while a paired phone shows FOUR tabs (view.ts: today, orders, inbox,
// settings). A phone tab bar must never wrap, whatever the number of tabs (3 unpaired, 4 paired) and the language.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../src/styles/app.css", import.meta.url), "utf8");
const view = readFileSync(new URL("../src/views/view.ts", import.meta.url), "utf8");

function rule(selector: string): string {
  const start = css.indexOf(`\n${selector}{`);
  expect(start, `rule ${selector}`).toBeGreaterThanOrEqual(0);
  return css.slice(start + 1, css.indexOf("}", start) + 1);
}

describe("bottom tab bar never wraps", () => {
  it("is not a grid with a fixed number of columns", () => {
    const tabs = rule(".tabs");
    expect(tabs).not.toMatch(/grid-template-columns:\s*repeat\(\s*\d/);
  });

  it("puts every tab in one row of equal cells, whatever their number", () => {
    const tabs = rule(".tabs");
    expect(tabs).toContain("display:grid");
    expect(tabs).toContain("grid-auto-flow:column");
    // minmax(0,1fr): a long label may shrink its cell; it can never push a tab onto a second row.
    expect(tabs).toContain("grid-auto-columns:minmax(0,1fr)");
  });

  it("lets a long label wrap INSIDE its own cell, centred, instead of overflowing", () => {
    const tab = rule(".tab");
    expect(tab).toContain("min-width:0");
    expect(tab).toContain("text-align:center");
    expect(tab).toMatch(/overflow-wrap:\s*anywhere/);
    expect(tab).toMatch(/padding-inline:/);
  });

  it("the paired phone really has more tabs than the old three columns (so the bug was real)", () => {
    const paired = view.match(/v\.paired === true \? \[([^\]]*)\]/);
    expect(paired, "the paired tab list").not.toBeNull();
    const count = (paired![1] ?? "").split(",").filter((part) => part.trim().length > 0).length;
    expect(count).toBeGreaterThanOrEqual(4);
  });
});
