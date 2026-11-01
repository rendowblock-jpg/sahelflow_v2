import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Window } from "happy-dom";
import { describe, expect, it } from "vitest";

import { renderStorePage } from "./index";
import { publishTestStore, renderInputFor } from "../test-support";

/*
 * Two findings of axe-core 4.10.2 in a real Chromium on the hosted pages (360 px, Arabic and French):
 *  - region (moderate): the announcement strip was a role="note" box at the top of <body>, outside every landmark.
 *    It is now a named region, named with the Studio's own word for the section.
 *  - color-contrast (serious) with Windows High Contrast on: the system drops background colours but a few light
 *    author text colours stayed, so light text landed on the system canvas. Measured before the change:
 *    Pulse language links, order button and submit 1.18:1; Lumen badge, order bar button and submit 1.10:1;
 *    Sahara badge 1.05:1. The forced-colors block now sets system colour pairs on exactly those parts.
 * That axe is clean afterwards is measured in a browser, not here; these tests pin the markup and the rules.
 */

const TEMPLATES = ["sahara", "atlas", "oasis", "prime", "souk", "reel", "noir", "lumen", "atelier", "pulse", "bloom"] as const;
type Template = (typeof TEMPLATES)[number];
type Locale = "ar" | "fr" | "en";

const SECTION_NAME: Record<Locale, string> = { ar: "الإعلان", fr: "Annonce", en: "Announcement" };

function parse(html: string): { document: Document; close: () => void } {
  const window = new Window({ settings: { disableJavaScriptEvaluation: true, disableJavaScriptFileLoading: true, disableCSSFileLoading: true, disableIframePageLoading: true } });
  const document = new window.DOMParser().parseFromString(html, "text/html") as unknown as Document;
  return { document, close: () => void window.happyDOM.close() };
}

async function pageHtml(template: Template, locale: Locale, kind: "home" | "product"): Promise<string> {
  const store = await publishTestStore({
    template,
    locale,
    shapeTheme: (theme) => {
      theme.announcement = { enabled: true, text: "شحن مجاني" };
    },
  });
  try {
    const html = renderStorePage(renderInputFor(store, kind === "product" ? { productId: "product_00000001" } : {}));
    if (html === null) throw new Error("page not found");
    return html;
  } finally {
    store.database.close();
  }
}

/** What a page may put directly under <body>: the skip link, scripts, and landmarks (a region needs a name). */
function isAllowedBodyChild(el: Element): boolean {
  if (el.tagName === "SCRIPT" || el.tagName === "LINK") return true;
  if (el.matches("a.sf-skip")) return true;
  if (el.tagName === "HEADER" || el.tagName === "MAIN" || el.tagName === "FOOTER") return true;
  if (el.tagName === "NAV" && (el.getAttribute("aria-label") ?? "").trim() !== "") return true;
  return el.getAttribute("role") === "region" && (el.getAttribute("aria-label") ?? "").trim() !== "";
}

describe("announcement strip is a named landmark (axe region)", () => {
  it.each(TEMPLATES)("%s: the strip is a region with a name, on the home page and the product page", async (template) => {
    for (const kind of ["home", "product"] as const) {
      const { document, close } = parse(await pageHtml(template, "ar", kind));
      try {
        const strips = document.querySelectorAll(".sf-ann");
        expect(strips, `${template} ${kind}: one strip`).toHaveLength(1);
        const strip = strips[0];
        expect(strip?.getAttribute("role"), `${template} ${kind}`).toBe("region");
        expect(strip?.getAttribute("aria-label"), `${template} ${kind}`).toBe(SECTION_NAME.ar);
        const stray = Array.from(document.body.children).filter((child) => !isAllowedBodyChild(child)).map((child) => child.tagName + "." + child.className);
        expect(stray, `${template} ${kind}: body children outside a landmark`).toEqual([]);
      } finally {
        close();
      }
    }
  });

  it.each(["ar", "fr", "en"] as const)("%s: the name is in the page language and is not a raw message key", async (locale) => {
    const { document, close } = parse(await pageHtml("sahara", locale, "home"));
    try {
      const name = document.querySelector(".sf-ann")?.getAttribute("aria-label") ?? "";
      expect(name).toBe(SECTION_NAME[locale]);
      expect(name).not.toContain("storefront.");
      // the moving copies stay hidden from assistive technology: only the first copy of the text is read
      expect(document.querySelectorAll(".sf-ann [aria-hidden=true]").length).toBeGreaterThan(0);
      expect(document.querySelectorAll(".sf-ann-set:not([aria-hidden=true]) > span:not([aria-hidden=true])")).toHaveLength(1);
    } finally {
      close();
    }
  });
});

/** The text of the single forced-colors block in the shared sheet, braces matched. */
function forcedBlock(): string {
  const css = readFileSync(join(process.cwd(), "control-plane/storefront/web/styles/shop.css"), "utf8");
  const head = "@media (forced-colors:active){";
  const start = css.indexOf(head);
  if (start < 0) throw new Error("no forced-colors block in shop.css");
  let depth = 1;
  let i = start + head.length;
  while (i < css.length && depth > 0) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") depth--;
    i++;
  }
  return css.slice(start + head.length, i - 1);
}

/** The bodies of every flat rule in the block whose selector list holds `selector`, joined. */
function forcedBody(selector: string): string {
  const bodies: string[] = [];
  for (const chunk of forcedBlock().split("}")) {
    const open = chunk.indexOf("{");
    if (open < 0) continue;
    const selectors = chunk.slice(0, open).split(",").map((part) => part.trim());
    if (selectors.includes(selector)) bodies.push(chunk.slice(open + 1));
  }
  return bodies.join(";");
}

describe("Windows High Contrast: light author text is replaced by system colour pairs (axe color-contrast)", () => {
  it("badges: text in the system text colour, with a border as the shape cue", () => {
    for (const selector of [".sf-badge", ".sf-badge--dark"]) {
      const body = forcedBody(selector);
      expect(body, selector).toMatch(/color:CanvasText!important/);
      expect(body, selector).toMatch(/border:1px solid CanvasText/);
    }
  });

  it("order buttons, form button and Pulse's order link: button face with button text", () => {
    for (const selector of [".sf-btn", ".sf-cta", ".sf-notice-link", ".px-cta", ".px-cta>span"]) {
      const body = forcedBody(selector);
      expect(body, selector).toMatch(/background-color:ButtonFace!important/);
      expect(body, selector).toMatch(/(^|;)color:ButtonText!important/);
    }
  });

  it("language links: link text on the canvas, and the current language is underlined, not told by colour alone", () => {
    expect(forcedBody(".sf-lang-i")).toMatch(/color:LinkText!important/);
    const current = forcedBody(".sf-lang-i[aria-current]");
    expect(current).toMatch(/color:CanvasText!important/);
    expect(current).toMatch(/text-decoration:underline/);
  });

  it("uses system colour names only: no colour of our own inside the block", () => {
    expect(forcedBlock()).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|color-mix\(|var\(--/);
  });
});
