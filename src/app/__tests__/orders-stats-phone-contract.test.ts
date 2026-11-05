/**
 * 31 Oct 2026 (w214): on a phone the four Orders KPI cards were a 2 x 2 grid of compact tiles (replaced 5 Nov by one strip; the rule stays). The grid rule lives in
 * responsive-system.css, scoped to a modifier class and to the phone range only; the page opts in.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const css = read("src/app/responsive-system.css").replace(/\/\*[\s\S]*?\*\//g, "");
const page = read("src/app/(dashboard)/orders/page.tsx");

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

describe("phone 2 x 2 stat grid rule", () => {
  const found = positions(css, "card-grid-phone-2x2");

  it("exists exactly once, inside the phone range (under 48rem) and nowhere else", () => {
    expect(found).toHaveLength(1);
    const blocks = enclosing(css, found[0] ?? 0);
    expect(blocks).toEqual(["@media (width < 48rem)"]);
  });

  it("is scoped to the shared grid AND the modifier, so no other page changes", () => {
    const at = found[0] ?? 0;
    const selector = css.slice(css.lastIndexOf("{", at - 1) + 1, css.indexOf("{", at)).trim();
    expect(selector).toContain(".card-grid-4.card-grid-phone-2x2");
  });

  it("makes two columns with a small gap", () => {
    const at = found[0] ?? 0;
    const body = css.slice(css.indexOf("{", at) + 1, css.indexOf("}", at));
    expect(body).toMatch(/grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
    expect(body).toMatch(/gap:\s*0\.5rem/);
  });

  it("leaves the shared grid rules as they were", () => {
    expect(css).toContain("@media (min-width: 40rem)");
    expect(css).toContain("@media (min-width: 80rem)");
    expect(css).toContain(".card-grid-4 {\n    grid-template-columns: repeat(4, minmax(0, 1fr));");
    expect(read("src/app/globals.css")).not.toContain("card-grid-phone-2x2");
    expect(read("src/app/phase5.css")).not.toContain("card-grid-phone-2x2");
  });
});

describe("orders page wiring", () => {
  // 5 Nov 2026 (item 1, orders): the four equal cards became ONE strip of three figures (active orders, delivered today,
  // revenue delivered today). The pending count lives in the status tab and in the confirmation-queue button, not in a
  // third place. The phone 2 x 2 rule above stays in the stylesheet (unused by this page now) and keeps its own tests.
  it("shows the KPIs as ONE strip of three figures, not four stat cards", () => {
    expect(page).toContain("<OrdersKpiStrip");
    expect(page.match(/<OrdersKpiItem\b/g)).toHaveLength(3);
    expect(page).not.toMatch(/<StatCard\b/);
    expect(page).not.toContain("compactOnPhone");
    expect(page).not.toContain("card-grid-phone-2x2");
    expect(page).not.toContain("orders.pendingLabel");
  });

  it("puts the strip above the status tabs", () => {
    expect(page.indexOf("<OrdersKpiStrip")).toBeGreaterThan(0);
    expect(page.indexOf("<OrdersKpiStrip")).toBeLessThan(page.indexOf("<Tabs"));
  });

  it("keeps each figure's destination: all orders, delivered orders, analytics", () => {
    const strip = page.slice(page.indexOf("<OrdersKpiStrip"), page.indexOf("</OrdersKpiStrip>"));
    expect(strip).toContain('href={statusTabHref("all")}');
    expect(strip).toContain('href={statusTabHref("delivered")}');
    expect(strip).toContain('href="/analytics"');
  });

  it("shows a dash, not 0 DA, when the member may not read money", () => {
    expect(page).toContain('todayRevenue === null ? "—" : formatDZD(todayRevenue, locale)');
  });

  it("builds the header actions with OrdersHeaderActions and hands it the create dialog as the main action", () => {
    expect(page).toContain("<OrdersHeaderActions");
    expect(page).toMatch(/primary=\{[\s\S]*?<CreateParamDialog/);
  });
});
