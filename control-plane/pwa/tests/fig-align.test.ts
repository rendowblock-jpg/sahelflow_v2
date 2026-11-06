// F-0059: the big numbers of the Today tiles sit on ONE line even when a label wraps to two or three lines.
// Before: a tile was a plain block, the label wrapped, the number followed it: "9" at y378 next to "4" at y353 (French, 390 px wide, 25 px apart).
// Now the tile is a flex column and the number is pinned to the tile bottom (tiles of one grid row already have the same height).
// Checked on the text of app.css (a unit test cannot lay a page out); the real build was measured in a browser separately
// (audit/ui-s42/pwa/fig.cjs: tiles on one row, value tops) and looked at.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../src/styles/app.css", import.meta.url), "utf8");
const body = (selector: string): string => {
  const escaped = selector.replace(/[.\\ ]/g, "\\$&");
  const m = css.match(new RegExp(`(?:^|\\n)${escaped}\\{([^}]*)\\}`));
  expect(m, `rule ${selector} must exist in app.css`).not.toBeNull();
  return m?.[1] ?? "";
};

describe("Today tiles (.fig) keep their numbers on one line", () => {
  it(".fig is a flex column, so the number can be pushed to the bottom of the tile", () => {
    const rule = body(".fig");
    expect(rule).toMatch(/display\s*:\s*flex/);
    expect(rule).toMatch(/flex-direction\s*:\s*column/);
  });
  it(".fig dd (the number) has an automatic top margin, which pins it to the tile bottom", () => {
    const rule = body(".fig dd");
    expect(rule).toMatch(/margin\s*:\s*auto\s+0\s+0(?![\w.])|margin-top\s*:\s*auto/);
  });
  it("the grid of tiles is unchanged: two columns, one column under 360 px, and .wide still spans the row", () => {
    expect(body(".figs")).toMatch(/grid-template-columns\s*:\s*1fr 1fr/);
    expect(body(".fig.wide")).toMatch(/grid-column\s*:\s*1\s*\/\s*-1/);
    expect(css).toMatch(/@media \(max-width:359px\)\{\.figs\{grid-template-columns:1fr\}\}/);
  });
  it("the number keeps its size and does not gain a bottom or side margin", () => {
    const rule = body(".fig dd");
    expect(rule).toMatch(/font-size\s*:\s*1\.875rem/);
    expect(rule).not.toMatch(/margin(-bottom|-inline|-left|-right)/);
  });
});
