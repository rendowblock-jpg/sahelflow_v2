import { describe, expect, it } from "vitest";
import type { AxeViolation } from "../e2e/support/axe";
import {
  focusIndicatorVisible,
  frameIndicatorVisible,
  isTrapped,
  judgeKeyboardTour,
  judgePageFacts,
  violationsForMode,
  type FocusStyle,
  type PageFacts,
  type TabStop,
  type TourFacts,
} from "../e2e/support/page-checks";

const plain: FocusStyle = {
  outlineStyle: "none",
  outlineWidth: "0px",
  outlineColor: "rgb(0, 0, 0)",
  boxShadow: "none",
  borderColor: "rgb(200, 200, 200)",
  backgroundColor: "rgb(255, 255, 255)",
};

describe("focusIndicatorVisible", () => {
  it("is false when nothing changed on focus", () => {
    expect(focusIndicatorVisible(plain, { ...plain })).toBe(false);
  });

  it("is true when a solid outline of real width appears", () => {
    expect(focusIndicatorVisible(plain, { ...plain, outlineStyle: "solid", outlineWidth: "2px" })).toBe(true);
  });

  it("is false for an outline of width 0 or style none", () => {
    expect(focusIndicatorVisible(plain, { ...plain, outlineStyle: "solid", outlineWidth: "0px" })).toBe(false);
    expect(focusIndicatorVisible(plain, { ...plain, outlineStyle: "none", outlineWidth: "3px" })).toBe(false);
  });

  it("is false when the same outline was already there before focus", () => {
    const outlined = { ...plain, outlineStyle: "solid", outlineWidth: "2px" };
    expect(focusIndicatorVisible(outlined, { ...outlined })).toBe(false);
  });

  it("is true when a box-shadow ring appears, false when it was already there", () => {
    const ring = "rgb(0, 90, 200) 0px 0px 0px 3px";
    expect(focusIndicatorVisible(plain, { ...plain, boxShadow: ring })).toBe(true);
    expect(focusIndicatorVisible({ ...plain, boxShadow: ring }, { ...plain, boxShadow: ring })).toBe(false);
  });

  it("is true when the border or the background changes", () => {
    expect(focusIndicatorVisible(plain, { ...plain, borderColor: "rgb(0, 90, 200)" })).toBe(true);
    expect(focusIndicatorVisible(plain, { ...plain, backgroundColor: "rgb(220, 230, 250)" })).toBe(true);
  });
});

describe("isTrapped", () => {
  const loop = (items: string[], times: number) => Array.from({ length: times }, () => items).flat();

  it("is true when the last 24 stops cycle among 3 elements while other controls exist", () => {
    expect(isTrapped(loop(["a", "b", "c"], 10), 12)).toBe(true);
  });

  it("is true for a two-element loop", () => {
    expect(isTrapped(loop(["a", "b"], 15), 20)).toBe(true);
  });

  it("is false when the page really has only those controls", () => {
    expect(isTrapped(loop(["a", "b", "c"], 10), 3)).toBe(false);
  });

  it("is false when 60 different elements were visited", () => {
    expect(isTrapped(Array.from({ length: 60 }, (_, i) => `e${i}`), 200)).toBe(false);
  });

  it("is false before there is enough evidence", () => {
    expect(isTrapped(loop(["a", "b", "c"], 5), 12)).toBe(false);
  });

  it("is false for a loop of four (more than a 3-element loop)", () => {
    expect(isTrapped(loop(["a", "b", "c", "d"], 8), 20)).toBe(false);
  });
});

const stop = (key: string, over: Partial<TabStop> = {}): TabStop => ({
  key,
  visible: true,
  width: 80,
  height: 32,
  before: plain,
  after: { ...plain, outlineStyle: "solid", outlineWidth: "2px" },
  ...over,
});

const tour = (over: Partial<TourFacts> = {}): TourFacts => ({
  firstStopInPage: true,
  stops: [stop("a#one"), stop("button#two")],
  totalControls: 2,
  shiftTabBackOk: true,
  dialog: null,
  ...over,
});

describe("judgeKeyboardTour", () => {
  it("passes a healthy tour", () => {
    expect(judgeKeyboardTour(tour())).toEqual([]);
  });

  it("fails when the first Tab stays on the body", () => {
    expect(judgeKeyboardTour(tour({ firstStopInPage: false }))).toEqual([
      "the first Tab press did not land inside the page",
    ]);
  });

  it("fails an invisible or zero-sized stop and names it", () => {
    expect(judgeKeyboardTour(tour({ stops: [stop("a#one", { visible: false })] }))).toEqual([
      "Tab stop a#one is not visible",
    ]);
    expect(judgeKeyboardTour(tour({ stops: [stop("a#one", { width: 0, height: 0 })] }))).toEqual([
      "Tab stop a#one is not visible",
    ]);
  });

  it("fails a stop with no focus indicator", () => {
    expect(judgeKeyboardTour(tour({ stops: [stop("a#one", { after: plain })] }))).toEqual([
      "Tab stop a#one has no visible focus indicator",
    ]);
  });

  it("fails when Shift+Tab does not walk back", () => {
    expect(judgeKeyboardTour(tour({ shiftTabBackOk: false }))).toEqual(["Shift+Tab does not walk back to the previous stop"]);
  });

  it("fails a keyboard trap", () => {
    const stops = Array.from({ length: 30 }, (_, i) => stop(`el${i % 3}`));
    const failures = judgeKeyboardTour(tour({ stops, totalControls: 40 }));
    expect(failures).toEqual(["keyboard trap: 30 Tab presses cycled among 3 elements while 40 controls exist"]);
  });

  it("fails a page with controls but no Tab stop at all", () => {
    expect(judgeKeyboardTour(tour({ stops: [], totalControls: 5, firstStopInPage: false }))).toContain("no Tab stop at all although 5 controls exist");
  });

  it("checks the dialog only when the page has one", () => {
    expect(judgeKeyboardTour(tour({ dialog: { opened: true, closedByEscape: true, focusReturnedToOpener: true } }))).toEqual([]);
    expect(judgeKeyboardTour(tour({ dialog: { opened: true, closedByEscape: false, focusReturnedToOpener: false } }))).toEqual([
      "Escape did not close the dialog",
      "focus did not return to the control that opened the dialog",
    ]);
    expect(judgeKeyboardTour(tour({ dialog: { opened: true, closedByEscape: true, focusReturnedToOpener: false } }))).toEqual([
      "focus did not return to the control that opened the dialog",
    ]);
    expect(judgeKeyboardTour(tour({ dialog: { opened: false, closedByEscape: false, focusReturnedToOpener: false } }))).toEqual([]);
  });
});

const facts = (over: Partial<PageFacts> = {}): PageFacts => ({
  htmlDir: "rtl",
  htmlLang: "ar",
  innerWidth: 390,
  scrollWidth: 390,
  rawKeys: [],
  mainTextLength: 400,
  arabicLetterSpacing: 0,
  primaryActionReachable: null,
  forcedColorsActive: false,
  reducedMotionActive: false,
  forcedInvisible: [],
  collapsedText: [],
  rootFontPx: 16,
  ...over,
});

describe("judgePageFacts", () => {
  const ar = { locale: "ar", viewport: "phone", mode: "normal" } as const;

  it("passes a healthy Arabic phone page", () => {
    expect(judgePageFacts(facts(), ar)).toEqual([]);
  });

  it("checks the document direction and language against the locale", () => {
    expect(judgePageFacts(facts({ htmlDir: "ltr" }), ar)).toEqual(['html dir is "ltr", expected "rtl" for ar']);
    expect(judgePageFacts(facts({ htmlDir: "ltr", htmlLang: "en" }), { ...ar, locale: "fr" })).toEqual([
      'html lang is "en", expected "fr"',
    ]);
    expect(judgePageFacts(facts({ htmlDir: "rtl", htmlLang: "fr" }), { ...ar, locale: "fr" })).toEqual([
      'html dir is "rtl", expected "ltr" for fr',
    ]);
  });

  it("fails raw translation keys and a blank page", () => {
    expect(judgePageFacts(facts({ rawKeys: ["orders.empty.title"] }), ar)).toEqual([
      "raw translation keys on screen: orders.empty.title",
    ]);
    expect(judgePageFacts(facts({ mainTextLength: 0 }), ar)).toEqual(["the page has no text (blank or still loading)"]);
  });

  it("fails sideways scroll on phone and tiny, with 1 px tolerance, but not on desktop", () => {
    expect(judgePageFacts(facts({ scrollWidth: 412 }), ar)).toEqual(["sideways scroll: content is 412 px wide in a 390 px window"]);
    expect(judgePageFacts(facts({ scrollWidth: 391 }), ar)).toEqual([]);
    expect(
      judgePageFacts(facts({ innerWidth: 320, scrollWidth: 330 }), { locale: "ar", viewport: "tiny", mode: "reflow320" }),
    ).toEqual(["sideways scroll: content is 330 px wide in a 320 px window"]);
    expect(judgePageFacts(facts({ innerWidth: 1366, scrollWidth: 1500 }), { locale: "ar", viewport: "desktop", mode: "normal" })).toEqual([]);
    expect(judgePageFacts(facts({ innerWidth: 1366, scrollWidth: 1500, rootFontPx: 32 }), { locale: "ar", viewport: "desktop", mode: "text200" })).toEqual([]);
  });

  it("fails letter-spacing on Arabic text only", () => {
    expect(judgePageFacts(facts({ arabicLetterSpacing: 2 }), ar)).toEqual(["2 Arabic text elements carry letter-spacing"]);
    expect(judgePageFacts(facts({ htmlDir: "ltr", htmlLang: "fr", arabicLetterSpacing: 2 }), { ...ar, locale: "fr" })).toEqual([]);
  });

  it("text200: the primary action must stay reachable (unknown is not a failure)", () => {
    const t = { locale: "ar", viewport: "desktop", mode: "text200" } as const;
    expect(judgePageFacts(facts({ primaryActionReachable: false, innerWidth: 1366, scrollWidth: 1366, rootFontPx: 32 }), t)).toEqual([
      "at 200% text size the primary action is not reachable",
    ]);
    expect(judgePageFacts(facts({ primaryActionReachable: true, rootFontPx: 32 }), t)).toEqual([]);
    expect(judgePageFacts(facts({ primaryActionReachable: null, rootFontPx: 32 }), t)).toEqual([]);
    expect(judgePageFacts(facts({ primaryActionReachable: false }), ar)).toEqual([]);
  });

  it("text200: text squeezed to no width is a failure, and only that mode looks", () => {
    const t = { locale: "en", viewport: "desktop", mode: "text200" } as const;
    expect(judgePageFacts(facts({ htmlDir: "ltr", htmlLang: "en", collapsedText: [], rootFontPx: 32 }), t)).toEqual([]);
    expect(
      judgePageFacts(
        facts({ htmlDir: "ltr", htmlLang: "en", collapsedText: ["span.line-clamp-2: Revenue", "p.title: Orders"], rootFontPx: 32 }),
        t,
      ),
    ).toEqual(["at 200% text size 2 text elements collapse to no width: span.line-clamp-2: Revenue, p.title: Orders"]);
    expect(
      judgePageFacts(facts({ htmlDir: "ltr", htmlLang: "en", collapsedText: ["span.line-clamp-2: Revenue"] }), {
        locale: "en",
        viewport: "desktop",
        mode: "normal",
      }),
    ).toEqual([]);
  });

  it("text200: the page must really be at the doubled size, or the cell proves nothing", () => {
    const t = { locale: "en", viewport: "desktop", mode: "text200" } as const;
    const en = { htmlDir: "ltr", htmlLang: "en" } as const;
    expect(judgePageFacts(facts({ ...en, rootFontPx: 32 }), t)).toEqual([]);
    expect(judgePageFacts(facts({ ...en, rootFontPx: 16 }), t)).toEqual([
      "at 200% text size the root font is 16 px, not 32 px: the setting did not apply",
    ]);
    expect(judgePageFacts(facts({ ...en, rootFontPx: 0 }), t)).toEqual([
      "at 200% text size the root font is 0 px, not 32 px: the setting did not apply",
    ]);
    // other modes are not judged on the root font
    expect(judgePageFacts(facts({ ...en, rootFontPx: 16 }), { locale: "en", viewport: "desktop", mode: "normal" })).toEqual([]);
  });

  it("forced: forced colours must be active and no control may vanish", () => {
    const f = { locale: "ar", viewport: "phone", mode: "forced" } as const;
    expect(judgePageFacts(facts({ forcedColorsActive: true }), f)).toEqual([]);
    expect(judgePageFacts(facts({ forcedColorsActive: false }), f)).toEqual(["forced colors were not active (the emulation did not apply)"]);
    expect(judgePageFacts(facts({ forcedColorsActive: true, forcedInvisible: ["button.x", "a.y"] }), f)).toEqual([
      "in forced colors 2 controls keep no boundary and no visible content: button.x, a.y",
    ]);
  });

  it("reducedMotion: the preference must be active", () => {
    const r = { locale: "ar", viewport: "desktop", mode: "reducedMotion" } as const;
    expect(judgePageFacts(facts({ reducedMotionActive: true }), r)).toEqual([]);
    expect(judgePageFacts(facts({ reducedMotionActive: false }), r)).toEqual(["prefers-reduced-motion was not active (the emulation did not apply)"]);
  });
});

describe("a field whose bordered frame draws the focus cue", () => {
  const ring = { ...plain, boxShadow: "rgb(10, 10, 10) 0px 0px 0px 3px", borderColor: "rgb(20, 20, 20)" };
  const fieldWithFrame = (beforeFrame: FocusStyle | null, afterFrame: FocusStyle | null) =>
    stop("input#search", { after: plain, beforeFrame, afterFrame });

  it("counts the frame's change as the indicator", () => {
    expect(frameIndicatorVisible({ beforeFrame: plain, afterFrame: ring })).toBe(true);
    expect(judgeKeyboardTour(tour({ stops: [fieldWithFrame(plain, ring)] }))).toEqual([]);
  });

  it("still fails when neither the field nor its frame changed", () => {
    expect(frameIndicatorVisible({ beforeFrame: plain, afterFrame: plain })).toBe(false);
    expect(judgeKeyboardTour(tour({ stops: [fieldWithFrame(plain, plain)] }))).toEqual([
      "Tab stop input#search has no visible focus indicator",
    ]);
  });

  it("still fails when there is no frame to look at", () => {
    expect(frameIndicatorVisible({ beforeFrame: null, afterFrame: null })).toBe(false);
    expect(frameIndicatorVisible({})).toBe(false);
    expect(judgeKeyboardTour(tour({ stops: [fieldWithFrame(null, null)] }))).toEqual([
      "Tab stop input#search has no visible focus indicator",
    ]);
  });
});

describe("violationsForMode", () => {
  const violation = (id: string): AxeViolation => ({ id, impact: "serious", help: id, helpUrl: "", nodes: [] });
  const both = [violation("color-contrast"), violation("aria-required-children")];

  it("forced colours: colour-contrast is not applied, every other rule is", () => {
    expect(violationsForMode(both, "forced").map((v) => v.id)).toEqual(["aria-required-children"]);
  });

  it("every other mode keeps every rule", () => {
    for (const mode of ["normal", "reflow320", "text200", "spacing", "reducedMotion", "keyboard"] as const) {
      expect(violationsForMode(both, mode).map((v) => v.id)).toEqual(["color-contrast", "aria-required-children"]);
    }
  });
});
