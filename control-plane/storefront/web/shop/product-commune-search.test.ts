import { Window } from "happy-dom";
import { describe, expect, it } from "vitest";

import { renderStorePage } from "./index";
import { publishTestStore, renderInputFor } from "../test-support";

/**
 * STORE-WILAYA69 slice 1b: the server renders the commune search box above the wilaya select, in every voice.
 * What the box does is tested in client/shop-commune-search.test.ts; here only the markup the script and a screen reader rely on.
 * The checkout form is drawn by renderProduct only (grep "f-wilaya": product.ts), so the product page is the one place to check.
 */

const TEMPLATES = ["sahara", "atlas", "oasis", "prime", "souk", "reel", "noir", "lumen", "atelier", "pulse", "bloom"] as const;
const TEXTS = {
  ar: { label: "ابحث عن بلديتك", none: "لم نجد هذه البلدية. اختر الولاية من الأسفل.", failed: "البحث غير متاح. اختر الولاية والبلدية من الأسفل.", count: "النتائج: {{count}}" },
  fr: { label: "Cherchez votre commune", none: "Aucune commune trouvée. Choisissez la wilaya ci-dessous.", failed: "La recherche est indisponible. Choisissez la wilaya et la commune ci-dessous.", count: "Résultats : {{count}}" },
  en: { label: "Search your commune", none: "No commune found. Choose the wilaya below.", failed: "Search is unavailable. Choose the wilaya and commune below.", count: "Results: {{count}}" },
} as const;

async function productDocument(template: (typeof TEMPLATES)[number], locale: "ar" | "fr" | "en"): Promise<{ document: Document; close: () => void }> {
  const store = await publishTestStore({ template, locale });
  let html: string | null;
  try {
    html = renderStorePage(renderInputFor(store, { productId: "product_00000001" }));
  } finally {
    store.database.close();
  }
  if (html === null) throw new Error("page not found");
  const window = new Window({ settings: { disableJavaScriptEvaluation: true, disableJavaScriptFileLoading: true, disableCSSFileLoading: true, disableIframePageLoading: true } });
  const document = new window.DOMParser().parseFromString(html, "text/html") as unknown as Document;
  return { document, close: () => void window.happyDOM.close() };
}

describe("product page: the commune search box (STORE-WILAYA69)", () => {
  it.each(TEMPLATES)("%s: a labelled combobox sits above the wilaya select and its listbox exists, hidden and empty", async (template) => {
    const { document, close } = await productDocument(template, "ar");
    try {
      const box = document.getElementById("f-search");
      expect(box, "the search input is drawn").not.toBeNull();
      expect(box?.tagName).toBe("INPUT");
      expect(box?.getAttribute("role")).toBe("combobox");
      expect(box?.getAttribute("aria-autocomplete")).toBe("list");
      expect(box?.getAttribute("aria-expanded")).toBe("false");
      expect(box?.getAttribute("dir")).toBe("auto");
      expect(box?.getAttribute("autocomplete")).toBe("off");
      const label = document.querySelector('label[for="f-search"]');
      expect(label?.textContent).toBe(TEXTS.ar.label);
      // aria-controls must point at an element that exists in the markup the server sends, even before anything is typed
      const listId = box?.getAttribute("aria-controls");
      expect(listId).toBeTruthy();
      const list = document.getElementById(listId ?? "");
      expect(list, "the listbox the input controls exists").not.toBeNull();
      expect(list?.getAttribute("role")).toBe("listbox");
      expect(list?.hasAttribute("hidden")).toBe(true);
      expect(list?.children).toHaveLength(0);
      expect(list?.getAttribute("aria-labelledby")).toBe(label?.id);
      expect(label?.id).toBeTruthy();
      // two polite status lines exist from the start (a live region added later is not always announced)
      for (const id of ["sf-search-note", "sf-search-count"]) {
        const line = document.getElementById(id);
        expect(line?.getAttribute("role")).toBe("status");
        expect(line?.getAttribute("aria-live")).toBe("polite");
        expect(line?.textContent).toBe("");
      }
      // above the wilaya select, inside the same form
      const wilaya = document.getElementById("f-wilaya");
      expect(box && wilaya && box.compareDocumentPosition(wilaya) & 4, "the box comes before the wilaya select").toBeTruthy();
      expect(box?.closest("form#order")).not.toBeNull();
      // the selects stay
      expect(document.getElementById("f-commune")).not.toBeNull();
    } finally {
      close();
    }
  });

  it.each(["ar", "fr", "en"] as const)("%s: the five texts reach the page data the script reads", async (locale) => {
    const { document, close } = await productDocument("lumen", locale);
    try {
      const data = JSON.parse(document.getElementById("sf-data")?.textContent ?? "{}") as { i: Record<string, string> };
      expect(document.querySelector('label[for="f-search"]')?.textContent).toBe(TEXTS[locale].label);
      expect(data.i.communeNone).toBe(TEXTS[locale].none);
      expect(data.i.communeFailed).toBe(TEXTS[locale].failed);
      // the Arabic translator wraps a substituted value in direction isolates; they are not part of the words
      expect(data.i.communeCount?.replace(/[\u2066-\u2069]/g, "")).toBe(TEXTS[locale].count);
      expect(document.getElementById("f-search")?.getAttribute("placeholder")).toBeTruthy();
      expect(document.getElementById("f-search")?.getAttribute("placeholder")).not.toMatch(/^storefront\./);
    } finally {
      close();
    }
  });
});
