// Every colour pair the phone's CSS puts on screen, in all 4 looks x light/dark, computed from the desktop's own tokens.
// Text 4.5:1 (WCAG 1.4.3). Controls and graphics 3:1 (1.4.11).
import { describe, expect, it } from "vitest";
import { readDesktop } from "../tools/gen-looks.mjs";
import { buildLooks, contrast } from "../tools/looks.mjs";

const L = buildLooks(readDesktop());
// [text token, token behind it, where the phone paints it]
const TEXT: Array<[string, string, string]> = [
  ["foreground", "background", "body text"], ["foreground", "card", "cards, tiles, sheets"], ["foreground", "muted", "neutral chips, skeleton"],
  ["foreground", "warning-tint", "strip, called-for box"], ["foreground", "destructive-tint", "failed chip, error box"], ["foreground", "success-tint", "done chip"],
  ["foreground", "accent", "own chat bubble (text)"], ["accent-foreground", "accent", "own chat bubble"],
  ["muted-foreground", "background", "hints on the page"], ["muted-foreground", "card", "hints in cards, tab labels"], ["muted-foreground", "muted", "neutral stamp"],
  ["muted-foreground", "warning-tint", "hint in a called-for box"], ["muted-foreground", "destructive-tint", "hint in an error box"],
  ["primary-foreground", "primary", "primary button, picked choice, banner, unread count"], ["primary", "primary-foreground", "button on the banner"],
  ["primary", "card", "current tab"], ["primary", "background", "links on the page"],
  ["destructive-foreground", "destructive", "danger button"], ["destructive-ink", "destructive-tint", "error title, failed status"], ["destructive-ink", "card", "error text"], ["destructive-ink", "background", "error text on the page"],
  ["success-ink", "success-tint", "done stamp, confirmed status"], ["success-ink", "card", "success text"],
  ["warning-ink", "warning-tint", "called-for title, waiting status, held badge"], ["warning-ink", "card", "warning text"],
];
const CONTROL: Array<[string, string, string]> = [
  ["edge", "card", "outline of buttons and fields on a card"], ["edge", "background", "outline of buttons and fields on the page"],
  ["ring", "background", "focus ring on the page"], ["ring", "card", "focus ring on a card"], ["primary", "card", "bars of the week"],
];

describe("looks: every pair the phone paints", () => {
  it("covers all 8 combinations", () => expect(Object.keys(L).sort()).toEqual(["atlas/dark", "atlas/light", "dune/dark", "dune/light", "oasis/dark", "oasis/light", "sahel/dark", "sahel/light"]));
  for (const [fg, bg, where] of TEXT) {
    it(`text ${fg} on ${bg} (${where}) is at least 4.5:1`, () => {
      for (const [k, t] of Object.entries(L)) expect(contrast(t[fg] ?? "#000000", t[bg] ?? "#FFFFFF"), `${k}: ${t[fg]} on ${t[bg]}`).toBeGreaterThanOrEqual(4.5);
    });
  }
  for (const [fg, bg, where] of CONTROL) {
    it(`${fg} against ${bg} (${where}) is at least 3:1`, () => {
      for (const [k, t] of Object.entries(L)) expect(contrast(t[fg] ?? "#000000", t[bg] ?? "#FFFFFF"), `${k}: ${t[fg]} on ${t[bg]}`).toBeGreaterThanOrEqual(3);
    });
  }
});
