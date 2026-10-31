import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { STOREFRONT_TEMPLATE_IDS, type StorefrontTemplateId } from "../../../../src/lib/storefront/presentation-types";
import manifest from "../asset-manifest.generated.json";
import { servePublicStorePage, type PageDeps } from "../page-route";
import { SAMPLE_PRODUCTS, publishTestStore } from "../test-support";
import { renderStorePage } from "./index";
import { productHref } from "./ui";

const deps: PageDeps = {
  render: renderStorePage,
  assets: { css: manifest.css, js: manifest.js, communes: manifest.communes, fonts: manifest.fonts, skins: manifest.skins },
  cache: null,
};

/** The HTML of one page of a published fixture store, rendered the way the Worker does. */
async function page(template: StorefrontTemplateId, locale: "ar" | "fr" | "en", product: number | null): Promise<string> {
  const store = await publishTestStore({ template, locale });
  const id = product === null ? null : (SAMPLE_PRODUCTS[product]?.id ?? null);
  const path = id ? productHref("sahel-store", id) : "/sahel-store";
  const response = await servePublicStorePage(new Request(`https://shop.test${path}`), store.env, "sahel-store", undefined, deps, id);
  const html = await response.text();
  store.database.close();
  expect(response.status).toBe(200);
  return html;
}

const read = (relative: string): string => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
const SHOP_CSS = read("../styles/shop.css");

describe("checkout form: keyboard hints and linked errors", () => {
  it("name, phone and address ask the phone keyboard for the right Enter key and keyboard type", async () => {
    const html = await page("sahara", "fr", 0);
    const tag = (pattern: RegExp): string => pattern.exec(html)?.[0] ?? "";
    expect(tag(/<input id="f-name"[^>]*>/)).toContain('enterkeyhint="next"');
    expect(tag(/<input id="f-phone"[^>]*>/)).toContain('enterkeyhint="next"');
    expect(tag(/<input id="f-phone"[^>]*>/)).toContain('inputmode="tel"');
    expect(tag(/<textarea id="f-address"[^>]*>/)).toMatch(/enterkeyhint="(next|done)"/);
  });

  it("every aria-describedby on the form points at an element that exists", async () => {
    const html = await page("sahara", "ar", 0);
    const form = /<form id="order"[\s\S]*?<\/form>/.exec(html)?.[0] ?? "";
    const ids = [...form.matchAll(/aria-describedby="([^"]+)"/g)].map((match) => match[1] ?? "");
    expect(ids.length).toBeGreaterThanOrEqual(5);
    for (const id of ids) expect(form, id).toContain(`id="${id}"`);
  });
});

describe("language switch and photos", () => {
  it("the language links are 44 px boxes at every phone width", () => {
    const rule = /\.sf-lang-i\{([^}]*)\}/.exec(SHOP_CSS)?.[1] ?? "";
    expect(rule).toContain("min-width:44px");
    expect(rule).toContain("height:44px");
    expect(SHOP_CSS).not.toMatch(/\.sf-lang-i\{min-width:(\d|[123]\d)px\}/);
  });

  it("a photo that fails to load becomes a designed slot (alt text on a plain surface), not the browser's broken-image icon", () => {
    expect(SHOP_CSS).toMatch(/img::before\{[^}]*content:attr\(alt\)/);
  });

  it("every picture on every style has alt, width and height, and only the first four are eager", async () => {
    for (const style of STOREFRONT_TEMPLATE_IDS) {
      for (const index of [null, 0] as const) {
        const html = await page(style, "ar", index);
        const images = html.match(/<img\b[^>]*>/g) ?? [];
        for (const image of images) {
          expect(image, `${style} ${index}`).toMatch(/\balt="/);
          expect(image, `${style} ${index}`).toMatch(/\bwidth="\d+"/);
          expect(image, `${style} ${index}`).toMatch(/\bheight="\d+"/);
        }
        // Above the fold (the hero, the first row of a two-column grid, the thumbnail strip) loads eagerly; everything after the fourth picture is lazy.
        expect(images.findLastIndex((image) => !image.includes('loading="lazy"')), `${style} ${index}`).toBeLessThan(4);
        expect(images.filter((image) => image.includes('fetchpriority="high"')).length, `${style} ${index}`).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("page weight budgets (product page)", () => {
  it("HTML stays under 30 KB in every style and language", async () => {
    for (const style of STOREFRONT_TEMPLATE_IDS) {
      for (const locale of ["ar", "fr", "en"] as const) {
        expect(Buffer.byteLength(await page(style, locale, 0)), `${style} ${locale}`).toBeLessThanOrEqual(30 * 1024);
      }
    }
  });

  it("first-party script is at most 25 KB gzipped and the stylesheet at most 15 KB gzipped", () => {
    const gz = (path: string): number => gzipSync(readFileSync(fileURLToPath(new URL(`../../public${path}`, import.meta.url)))).length;
    expect(gz(manifest.js)).toBeLessThanOrEqual(25 * 1024);
    expect(gz(manifest.css)).toBeLessThanOrEqual(15 * 1024);
  });
});
