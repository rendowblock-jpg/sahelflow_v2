/**
 * @vitest-environment happy-dom
 */
/**
 * The product tour on the home page (WCAG 2.4.3 Focus Order, 2.4.7 Focus Visible).
 *
 * The tour is a stack of cross-fading figures. With the script on, only the figure marked data-on is drawn; the
 * others sit at opacity 0 on top of each other. Each figure holds a link ("Enlarge"), so a keyboard user could Tab
 * onto an invisible link (3 stops with 4 slides). The fix: every inactive figure is inert (not focusable, not read
 * out), on load and on every slide change. Without the script (or without IntersectionObserver, which the boot script
 * needs before it adds .js-motion) the figures are a plain list and stay as they are: nothing inert there.
 *
 * The page is built by the real home page module and the real marketing/src/home4.js runs against it in happy-dom.
 * Layout is not computed by happy-dom, so the scroll position is faked on the track (the same numbers the script reads).
 * The real-browser Tab run is in the pull request.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const marketing = join(dirname(fileURLToPath(import.meta.url)), "..", "marketing");
const { homePage } = (await import("../marketing/src/pages.mjs")) as { homePage: (locale: string) => string };
const SCRIPT = readFileSync(join(marketing, "src", "home4.js"), "utf8");
const LOCALES = ["en", "fr", "ar"];

const figures = () => Array.from(document.querySelectorAll<HTMLElement>(".h4-shot"));
const inertFlags = () => figures().map((f) => f.hasAttribute("inert"));
/** a link a keyboard can reach: no inert ancestor */
const reachable = (el: Element) => el.closest("[inert]") === null;
const zoomLinkReach = () => figures().map((f) => reachable(f.querySelector("a.h5-zoomlink")!));

function mount(locale: string, { motion }: { motion: boolean }) {
  const html = homePage(locale);
  const body = /<body[^>]*>([\s\S]*)<\/body>/.exec(html)![1].replace(/<script[\s\S]*?<\/script>/g, "");
  document.documentElement.className = motion ? "js js-motion" : "no-js";
  document.documentElement.setAttribute("data-motion", "full");
  document.body.innerHTML = body;
  // the order-reader demo loads a module from the server; not what is tested here
  document.querySelector("[data-type]")?.remove();
}

/** Run home4.js; return a function that moves the story to progress p (0..1) the way a scroll does. */
function run(): (p: number) => void {
  class IO {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("IntersectionObserver", IO);
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal("requestAnimationFrame", (f: (t: number) => void) => (f(0), 1));
  (Element.prototype as unknown as { getAnimations: () => unknown[] }).getAnimations = () => [];
  let p = 0;
  const track = document.querySelector<HTMLElement>(".h4-story-track");
  const H = 3000;
  if (track) {
    track.getBoundingClientRect = () => ({ top: -p * (H - innerHeight), height: H }) as DOMRect;
  }
  new Function(SCRIPT)();
  return (to: number) => {
    p = to;
    window.dispatchEvent(new Event("scroll"));
  };
}

beforeEach(() => {
  document.documentElement.className = "";
});
afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("tour slides without the script", () => {
  it.each(LOCALES)("%s: the page has 4 figures and none is inert or aria-hidden", (locale) => {
    mount(locale, { motion: false });
    expect(figures()).toHaveLength(4);
    expect(inertFlags()).toEqual([false, false, false, false]);
    expect(figures().map((f) => f.hasAttribute("aria-hidden"))).toEqual([false, false, false, false]);
    expect(zoomLinkReach()).toEqual([true, true, true, true]);
  });

  it.each(LOCALES)("%s: the script leaves every figure alone when .js-motion is absent", (locale) => {
    mount(locale, { motion: false });
    run();
    expect(inertFlags()).toEqual([false, false, false, false]);
    expect(zoomLinkReach()).toEqual([true, true, true, true]);
  });
});

describe("tour slides with the script", () => {
  it.each(LOCALES)("%s: after init only the first figure is reachable", (locale) => {
    mount(locale, { motion: true });
    run();
    expect(figures().map((f) => f.hasAttribute("data-on"))).toEqual([true, false, false, false]);
    expect(inertFlags()).toEqual([false, true, true, true]);
    expect(zoomLinkReach()).toEqual([true, false, false, false]);
  });

  it("a slide change makes the previous figure inert and the new one reachable", () => {
    mount("en", { motion: true });
    const scrollTo = run();
    scrollTo(0.3); // 4 slides: 0.3 -> slide 1
    expect(figures().map((f) => f.hasAttribute("data-on"))).toEqual([false, true, false, false]);
    expect(inertFlags()).toEqual([true, false, true, true]);
    expect(zoomLinkReach()).toEqual([false, true, false, false]);
    scrollTo(0.99); // last slide
    expect(inertFlags()).toEqual([true, true, true, false]);
    expect(zoomLinkReach()).toEqual([false, false, false, true]);
    scrollTo(0); // and back to the first
    expect(inertFlags()).toEqual([false, true, true, true]);
    expect(zoomLinkReach()).toEqual([true, false, false, false]);
  });

  it("the data-on figure and the one reachable figure are always the same one", () => {
    mount("fr", { motion: true });
    const scrollTo = run();
    for (const p of [0, 0.2, 0.26, 0.5, 0.74, 1, 0.6, 0.1, 0]) {
      scrollTo(p);
      const on = figures().findIndex((f) => f.hasAttribute("data-on"));
      expect(figures().filter((f) => !f.hasAttribute("inert"))).toEqual([figures()[on]]);
    }
  });

  it("the step buttons and step list keep their own state (aria-current follows the slide)", () => {
    mount("en", { motion: true });
    const scrollTo = run();
    const current = () => Array.from(document.querySelectorAll("[data-go]")).findIndex((b) => b.getAttribute("aria-current") === "step");
    expect(current()).toBe(0);
    scrollTo(0.6);
    expect(current()).toBe(2);
    expect(document.querySelectorAll("[data-steps] > li[data-on]")).toHaveLength(1);
  });
});
