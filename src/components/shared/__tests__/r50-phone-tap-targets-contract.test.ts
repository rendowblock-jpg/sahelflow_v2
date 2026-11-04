/**
 * R50 phone tap targets (sweep run1: 353 tap-target hits on the list/detail pages). The harness rule: on a phone every
 * link, button, input, select and role=button/tab/switch must measure 40 x 40 css px or more, except an inline link inside
 * a sentence. These tests read the source so the rule cannot slip back; the numbers come from the sweep (see
 * audit/program/results/tapa.md).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(resolve(__dirname, "../../..", rel), "utf8");

describe("R50 phone tap-target authority (responsive-system.css)", () => {
  const css = read("app/responsive-system.css");
  const start = css.indexOf("/* R50 phone tap targets */");
  const block = start >= 0 ? css.slice(start) : "";

  it("has one marked phone-only block", () => {
    expect(start, "marker comment missing").toBeGreaterThanOrEqual(0);
    expect(block).toMatch(/@media\s*\(max-width:\s*639\.98px\)|@media\s*\(width\s*<\s*40rem\)/);
  });

  it("sits in the components layer so any utility class (hidden, block, min-h-0, h-14) still wins", () => {
    expect(block).toMatch(/@layer components/);
  });

  it("is scoped to the dashboard workspace and uses :where() so it adds no specificity", () => {
    expect(block).toMatch(/\[data-shell-region="workspace"\]/);
    expect(block).toMatch(/:where\(/);
  });

  it("gives buttons, selects, inputs, tabs and menu items a 2.5rem floor in both dimensions", () => {
    expect(block).toMatch(/min-height:\s*2\.5rem/);
    expect(block).toMatch(/min-width:\s*2\.5rem/);
    for (const sel of ["button", "select", '[role="tab"]', '[role="button"]', '[role="menuitem"]', "summary"]) {
      expect(block, `selector ${sel}`).toContain(sel);
    }
  });

  it("gives a tab a height floor but NO min-width (a flex tab with an explicit min-width stops wrapping and its label spills over the next tab)", () => {
    // Found by a real tap on /risk in English on a phone (production build): five tabs shrank to 68 px cells, the label of the second
    // (about 140 px) spilled over the first, and a tap on the middle of Overview opened the second tab.
    const tabRule = block.match(/:where\(\s*\[role="tab"\]\s*\)\s*\{([^}]*)\}/);
    expect(tabRule, "a separate tab rule").not.toBeNull();
    expect(tabRule![1]).toMatch(/min-height:\s*2\.5rem/);
    expect(tabRule![1]).not.toMatch(/min-width/);
    const list = block.match(/:where\(\s*button:not[\s\S]*?\)\s*\{[^}]*\}/);
    expect(list, "the generic control list").not.toBeNull();
    expect(list![0]).not.toContain('[role="tab"]');
    expect(block).toMatch(/a\[href\]:not\(p a, \[data-inline-link\], \[role="tab"\]\)\)\s*\{\s*min-width:\s*2\.5rem;\s*\}/);
  });

  it("turns a bare link into an inline-flex 2.5rem box, except a link inside a sentence", () => {
    expect(block).toMatch(/display:\s*inline-flex/);
    expect(block).toMatch(/align-items:\s*center/);
    expect(block).toMatch(/:not\([^)]*(p|\[data-inline-link\])[^)]*\)/);
  });
});

describe("R50 switch and checkbox keep a 40 px box on a phone without growing the drawn control", () => {
  it("Switch root is 40 px tall on a phone and draws the track inside a transparent border", () => {
    const src = read("components/ui/switch.tsx");
    expect(src).toContain("max-sm:data-[size=default]:h-10");
    expect(src).toContain("max-sm:data-[size=default]:w-12");
    expect(src).toContain("max-sm:bg-clip-padding");
  });

  it("Checkbox root is 40 px on a phone and draws the box inside a transparent border", () => {
    const src = read("components/ui/checkbox.tsx");
    expect(src).toContain("max-sm:size-10");
    expect(src).toContain("max-sm:bg-clip-padding");
  });
});

describe("R50 shared card list row", () => {
  const src = read("components/data-table/data-table-cards.tsx");
  it("title and subtitle links are 40 px blocks and the subtitle link sits above the stretched title link", () => {
    expect(src).toMatch(/data-slot="title"[\s\S]{0,400}\[&_a\]:min-h-10/);
    expect(src).toMatch(/data-slot="subtitle"[\s\S]{0,400}\[&_a\]:min-h-10/);
    expect(src).toMatch(/data-slot="subtitle"[\s\S]{0,400}\[&_a\]:relative[\s\S]{0,40}\[&_a\]:z-10/);
  });
});

describe("R50 Button keeps a phone floor that its size variants cannot lower", () => {
  it("every size, including the 36 px default and the min-h-(--sf-touch-target) ones, is 40 px on a phone", () => {
    const src = read("components/ui/button.tsx");
    // the component layer rule in responsive-system.css loses to a utility that states min-height, so Button states it too
    expect(src).toMatch(/"sf-button inline-flex[^"]*max-sm:min-h-10[^"]*max-sm:min-w-10/);
  });
});

describe("R50 truncated links keep their ellipsis", () => {
  it("the shared rule only changes display for a link that is not .truncate or line-clamped", () => {
    const css = read("app/responsive-system.css");
    const rule = css.slice(css.indexOf("/* R50 phone tap targets */"));
    expect(rule).toMatch(/a\[href\]:not\([^)]*\.truncate[^)]*\[class\*="line-clamp"\][^)]*\)\)\s*\{\s*display:\s*inline-flex/);
  });

  it("the notification row title link is a 40 px line on a phone (it is a truncated flex item, stretched over the row)", () => {
    expect(read("components/notifications/notification-feed-list.tsx")).toMatch(/min-w-0 flex-1 truncate[^"]*max-sm:leading-10/);
  });
});
