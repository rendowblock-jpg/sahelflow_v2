// F-0053: the phone app's alert box ("Your decision is awaited", "Waiting for your PC") has ONE even border on all four sides.
// It used to carry a 6 px double band on its start side only: a thick coloured side band is a pattern refused on alerts.
// Checked on the text of app.css (not seen in a browser); the real build was looked at separately.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../src/styles/app.css", import.meta.url), "utf8");
const body = (selector: string): string => {
  const escaped = selector.replace(/[.\\]/g, "\\$&");
  const m = css.match(new RegExp(`(?:^|\\n)${escaped}\\{([^}]*)\\}`));
  expect(m, `rule ${selector} must exist in app.css`).not.toBeNull();
  return m?.[1] ?? "";
};

describe("alert boxes in app.css (.margin and .alert)", () => {
  for (const selector of [".margin", ".alert"]) {
    it(`${selector} has no one-sided border (no band on the start, end, left, right, top or bottom edge alone)`, () => {
      expect(body(selector)).not.toMatch(/border-(inline|block)?-?(start|end|left|right|top|bottom)\s*:/);
    });
    it(`${selector} uses a plain solid border, never double, dashed or dotted`, () => {
      expect(body(selector)).not.toMatch(/\b(double|dashed|dotted|groove|ridge)\b/);
    });
  }
  it(".margin keeps the amber tint and its own border colour, .alert the red ones (the box must still read as the call of the screen)", () => {
    const margin = body(".margin"), alert = body(".alert");
    expect(margin).toMatch(/background\s*:\s*var\(--warning-tint\)/);
    expect(margin).toMatch(/border(-color)?\s*:[^;]*var\(--warning-line\)/);
    expect(alert).toMatch(/background\s*:\s*var\(--destructive-tint\)/);
    expect(alert).toMatch(/border(-color)?\s*:[^;]*var\(--destructive-line\)/);
  });
  it(".margin inherits its width from .note (1 px) or sets one even width of at most 2 px", () => {
    const rule = body(".margin");
    const widths = [...rule.matchAll(/border(?:-width)?\s*:\s*(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));
    for (const w of widths) expect(w).toBeLessThanOrEqual(2);
    expect(body(".note")).toMatch(/border\s*:\s*1px solid/);
  });
});
