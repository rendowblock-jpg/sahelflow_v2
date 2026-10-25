import { Window } from "happy-dom";
import { describe, expect, it } from "vitest";

import { renderStorePage } from "./index";
import { publishTestStore, renderInputFor } from "../test-support";

/**
 * axe-core 4.10 on the staging product page (phone, Arabic) found two things:
 *  - region: the fixed order bar #sf-sticky sat after the footer, outside every landmark;
 *  - scrollable-region-focusable: the chips row (.sf-chips, overflow-x:auto) scrolls sideways on a phone, but it holds only
 *    spans, so a keyboard user could not reach it to scroll.
 * These tests pin the markup both fixes rely on. That axe is then clean is measured in a real browser, not here.
 */

const TEMPLATES = ["sahara", "atlas", "oasis", "prime", "souk", "reel", "noir", "lumen", "atelier", "pulse", "bloom"] as const;

function productDocument(html: string): { document: Document; close: () => void } {
  const window = new Window({ settings: { disableJavaScriptEvaluation: true, disableJavaScriptFileLoading: true, disableCSSFileLoading: true, disableIframePageLoading: true } });
  const document = new window.DOMParser().parseFromString(html, "text/html") as unknown as Document;
  return { document, close: () => void window.happyDOM.close() };
}

/** The nearest ancestor that is a landmark with a name axe accepts: <main>, or a region/complementary that is named. */
function landmarkOf(el: Element): Element | null {
  for (let node = el.parentElement; node; node = node.parentElement) {
    if (node.tagName === "MAIN") return node;
    const role = node.getAttribute("role");
    const named = (node.getAttribute("aria-label") ?? "").trim() !== "" || node.hasAttribute("aria-labelledby");
    if ((role === "region" || role === "complementary") && named) return node;
  }
  return null;
}

async function productHtml(template: (typeof TEMPLATES)[number], locale: "ar" | "fr" | "en"): Promise<string> {
  const store = await publishTestStore({ template, locale });
  try {
    const html = renderStorePage(renderInputFor(store, { productId: "product_00000001" }));
    if (html === null) throw new Error("page not found");
    return html;
  } finally {
    store.database.close();
  }
}

describe("product page: landmarks and the chips row (PB-STORE-PRODUCT-AXE)", () => {
  it.each(TEMPLATES)("%s: the order bar sits inside a landmark and no landmark is repeated", async (template) => {
    const { document, close } = productDocument(await productHtml(template, "ar"));
    try {
      const bar = document.getElementById("sf-sticky");
      expect(bar, "the order bar is drawn").not.toBeNull();
      expect(bar && landmarkOf(bar), "the order bar has a landmark around it").not.toBeNull();
      // the script finds the bar and its button by id, and the button stays a link to the form
      expect(bar?.querySelector("#sf-bar-cta")?.getAttribute("href")).toBe("#order");
      expect(document.querySelectorAll("main")).toHaveLength(1);
      expect(document.querySelectorAll("body > header, [role=banner]")).toHaveLength(1);
      expect(document.querySelectorAll("body > footer, [role=contentinfo]")).toHaveLength(1);
    } finally {
      close();
    }
  });

  it.each(TEMPLATES)("%s: the chips row can be reached by keyboard and has a name", async (template) => {
    const { document, close } = productDocument(await productHtml(template, "ar"));
    try {
      const chips = document.querySelector(".sf-chips");
      if (chips === null) {
        // atelier and bloom lay their promises out in their own markup and draw no chips row
        expect(["atelier", "bloom"]).toContain(template);
        return;
      }
      expect(chips.getAttribute("tabindex")).toBe("0");
      expect(chips.getAttribute("role")).toBe("group");
      const name = (chips.getAttribute("aria-label") ?? "").trim();
      expect(name).not.toBe("");
      expect(name).not.toContain("storefront."); // a raw message key would mean the text is missing from the page's table
      expect(chips.querySelectorAll("span").length).toBeGreaterThan(0);
    } finally {
      close();
    }
  });

  it.each(["ar", "fr", "en"] as const)("lumen %s: the row's name is in the page language", async (locale) => {
    const { document, close } = productDocument(await productHtml("lumen", locale));
    try {
      const name = document.querySelector(".sf-chips")?.getAttribute("aria-label") ?? "";
      expect(name).toBe({ ar: "شارات الثقة", fr: "Badges de confiance", en: "Trust badges" }[locale]);
    } finally {
      close();
    }
  });
});
