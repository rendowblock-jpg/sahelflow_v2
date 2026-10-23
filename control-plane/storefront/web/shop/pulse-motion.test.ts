import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Window } from "happy-dom";
import { describe, expect, it } from "vitest";

import { renderStorePage } from "./index";
import { publishTestStore, renderInputFor } from "../test-support";

/**
 * Pulse draws a red strip of the store's promises that slides across the page (.px-marquee). The track holds FOUR copies of the
 * words and slides by half its width, so the loop never shows a gap. A visitor who asks for less motion (prefers-reduced-motion)
 * used to get the frozen start of that track: 4,830 px of text in a 390 px strip, cut in the middle of a word
 * ("CONFIRMATION TELEPHONIQUE ◆ LIVRA"), because the page-wide reduced-motion rule makes every animation last 0.01 ms and the track
 * jumps back to its start. The announcement bar of the shared sheet already has the right answer for the same situation (one copy,
 * wrapped, centred); the strip now does the same.
 *
 * What a vitest file can check is the markup the rule relies on and the text of the rule. That the strip then looks right is
 * measured in a real browser on the deployed page (audit/tmp/marquee_probe.mjs); it is not proven here.
 */

const sheet = (name: string) => readFileSync(join(process.cwd(), "control-plane/storefront/web/styles", `${name}.css`), "utf8");

/** The bodies of every `@media (prefers-reduced-motion:reduce){...}` block, braces matched. */
function reducedMotionBlocks(css: string): string[] {
  const head = "@media (prefers-reduced-motion:reduce){";
  const blocks: string[] = [];
  for (let from = css.indexOf(head); from !== -1; from = css.indexOf(head, from + head.length)) {
    let depth = 1;
    let index = from + head.length;
    while (index < css.length && depth > 0) {
      if (css[index] === "{") depth += 1;
      else if (css[index] === "}") depth -= 1;
      index += 1;
    }
    blocks.push(css.slice(from + head.length, index - 1));
  }
  return blocks;
}

describe("the Pulse strip under reduced motion", () => {
  const css = sheet("pulse");
  const blocks = reducedMotionBlocks(css);
  const mine = blocks.filter((block) => block.includes(".px-track"));

  it("has its own reduced-motion rules for the strip, apart from the page-wide animation-duration one", () => {
    expect(blocks.length).toBeGreaterThanOrEqual(2);
    expect(mine).toHaveLength(1);
  });

  it("stops the slide and shows one copy of the words, wrapped and centred, not the first 390 px of a 4,830 px track", () => {
    const block = mine[0] ?? "";
    // compact type and spacing: four promises stacked at the normal size made a 126-152 px red band at 360-390 px (measured on staging); this one is 88 px in French, 53-71 px in Arabic
    expect(block).toContain("body[data-voice=pulse] .px-marquee{white-space:normal;text-align:center;padding-block:6px;font-size:13px;line-height:1.35}");
    expect(block).toContain("body[data-voice=pulse] .px-marquee .px-track{animation:none;display:block;width:auto}");
    expect(block).toContain("body[data-voice=pulse] .px-marquee .px-set{display:flex;flex-wrap:wrap;justify-content:center}");
    expect(block).toContain("body[data-voice=pulse] .px-marquee .px-set span{padding-inline:14px}");
    expect(block).toContain("body[data-voice=pulse] .px-marquee .px-set~.px-set{display:none}");
  });

  it("comes after the slide's own rules, and beats the right-to-left one (it names a different animation) on specificity or on order", () => {
    const block = mine[0] ?? "";
    const blockAt = css.indexOf(block);
    expect(blockAt).toBeGreaterThan(css.indexOf("[dir=rtl] body[data-voice=pulse] .px-track{animation-name:sf-marquee-rtl}"));
    expect(blockAt).toBeGreaterThan(css.indexOf("body[data-voice=pulse] .px-track{display:inline-flex;width:max-content;animation:sf-marquee 24s linear infinite}"));
    // the rule that stops the slide must be at least as specific as `[dir=rtl] body[data-voice=pulse] .px-track` (one attribute, one more attribute, one class, one tag)
    expect(block).toContain(".px-marquee .px-track{animation:none");
  });

  it("keeps the slide itself for visitors who did not ask for less motion", () => {
    expect(css).toContain("body[data-voice=pulse] .px-track{display:inline-flex;width:max-content;animation:sf-marquee 24s linear infinite}");
    expect(css).toContain("[dir=rtl] body[data-voice=pulse] .px-track{animation-name:sf-marquee-rtl}");
    for (const block of mine) expect(block).not.toContain("sf-marquee");
  });
});

describe("the markup those rules rely on", () => {
  it.each(["landing", "store"] as const)("pulse %s: the strip is hidden from assistive technology and its track holds four identical copies of the words", async (mode) => {
    const store = await publishTestStore({
      template: "pulse",
      locale: "fr",
      shapeTheme: (theme) => {
        (theme as unknown as { mode: string }).mode = mode;
      },
    });
    const html = renderStorePage(renderInputFor(store, { productId: mode === "landing" ? null : "product_00000001" }));
    expect(html).not.toBeNull();
    const window = new Window({ settings: { disableJavaScriptEvaluation: true, disableJavaScriptFileLoading: true, disableCSSFileLoading: true, disableIframePageLoading: true } });
    try {
      const document = new window.DOMParser().parseFromString(html ?? "", "text/html");
      const strip = document.querySelector(".px-marquee");
      expect(strip, "the strip is drawn").not.toBeNull();
      expect(strip?.getAttribute("aria-hidden")).toBe("true");
      const sets = Array.from(document.querySelectorAll(".px-marquee .px-track > .px-set"));
      expect(sets).toHaveLength(4);
      const first = sets[0]?.textContent ?? "";
      expect(first.trim().length).toBeGreaterThan(0);
      for (const set of sets) expect(set.textContent).toBe(first);
      // every direct child of the track is a set, so `.px-set~.px-set` reaches exactly copies 2 to 4
      expect(document.querySelector(".px-marquee .px-track")?.children).toHaveLength(4);
    } finally {
      void window.happyDOM.close();
      store.database.close();
    }
  });
});
