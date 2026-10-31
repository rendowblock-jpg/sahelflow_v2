import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";

import { createPublicTranslator } from "../translator";
import { formatPrice } from "./format";
import { renderStorePage } from "./index";
import { publishTestStore, renderInputFor, SAMPLE_PRODUCTS } from "../test-support";

const HOSTILE = `"><img src=x onerror=alert(1)><script>alert(1)</script>`;

type Store = Awaited<ReturnType<typeof publishTestStore>>;

function page(store: Store, overrides: Parameters<typeof renderInputFor>[1] = {}): string {
  const html = renderStorePage(renderInputFor(store, overrides));
  if (html === null) throw new Error("page not found");
  return html;
}

function visible(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "");
}

type OrderData = {
  v: number; slug: string; storefrontId: string; releaseId: string; locale: string; key: string; cdir: string; name: string; wa: string;
  items: Array<{ k: string; l: string | null; p: number; r: number; s: string }>;
  fees: Record<string, [number | null, number | null]>;
  i: Record<string, string>;
};

function data(html: string): OrderData {
  const raw = /<script type="application\/json" id="sf-data">([\s\S]*?)<\/script>/.exec(html)?.[1];
  if (!raw) throw new Error("no order data block");
  return JSON.parse(raw);
}

const count = (html: string, pattern: RegExp) => html.match(pattern)?.length ?? 0;

describe("store home", () => {
  it("is one landmark structure: skip link, one h1, one main, header, footer", async () => {
    const store = await publishTestStore({ locale: "fr" });
    const html = page(store);
    expect(html.startsWith('<!doctype html>\n<html lang="fr" dir="ltr">')).toBe(true);
    expect(count(html, /<h1[\s>]/g)).toBe(1);
    expect(count(html, /<main[\s>]/g)).toBe(1);
    expect(count(html, /<header[\s>]/g)).toBe(1);
    expect(count(html, /<footer[\s>]/g)).toBe(1);
    expect(html).toContain('<a class="sf-skip" href="#main">');
    expect(html.indexOf("<header")).toBeLessThan(html.indexOf("<main"));
    expect(html.indexOf("</main>")).toBeLessThan(html.indexOf("<footer"));
    expect(html).not.toContain("<script src="); // the home needs no script
    expect(html).toContain('<link rel="stylesheet" href="/_sf/shop.test.css">');
    store.database.close();
  });

  it("links every product card to its own page and shows price and stock state", async () => {
    const store = await publishTestStore({ locale: "fr", shapeTheme: (theme) => { theme.showStock = true; } });
    const html = page(store);
    for (const id of ["product_00000001", "product_00000002", "product_00000003"]) {
      expect(html).toContain(`href="/sahel-store/p/${id}"`);
    }
    expect(html).toContain(formatPrice(2_500, "fr"));
    expect(html).toContain(createPublicTranslator("fr")("storefront.shop.from", { price: formatPrice(8_000, "fr") }));
    expect(html).toContain(createPublicTranslator("fr")("storefront.view.outOfStock"));
    expect(html).toContain(createPublicTranslator("fr")("storefront.view.lowStock", { count: 3 }));
    store.database.close();
  });

  it("renders Arabic right to left and offers the other two languages as plain links", async () => {
    const store = await publishTestStore({ locale: "ar" });
    const html = page(store);
    expect(html.startsWith('<!doctype html>\n<html lang="ar" dir="rtl">')).toBe(true);
    expect(html).toContain('href="/sahel-store?lang=fr"');
    expect(html).toContain('href="/sahel-store?lang=en"');
    expect(html).not.toContain('href="/sahel-store?lang=ar"');
    expect(html).toContain('<link rel="canonical" href="https://shop.test/sahel-store">');
    expect(html).toContain('<link rel="alternate" hreflang="x-default" href="https://shop.test/sahel-store">');
    const french = page(store, { locale: "fr" });
    expect(french).toContain('<link rel="canonical" href="https://shop.test/sahel-store?lang=fr">');
    store.database.close();
  });

  it("never leaks a raw message key into the visible text, in any language", async () => {
    const store = await publishTestStore({ locale: "fr" });
    for (const locale of ["ar", "fr", "en"] as const) {
      for (const productId of [null, "product_00000001", "product_00000003", "product_00000002"]) {
        const text = visible(page(store, { locale, productId }));
        expect(text.match(/storefront\.[a-z]+\.[A-Za-z]+/g) ?? [], `${locale} ${productId}`).toEqual([]);
        expect(text).not.toMatch(/\{\{|undefined|\[object/);
      }
    }
    store.database.close();
  });

  it("follows the seller's knobs", async () => {
    const store = await publishTestStore({
      template: "oasis",
      shapeTheme: (theme) => {
        theme.radius = "sharp";
        theme.density = "compact";
        theme.catalog = { ...theme.catalog, cardStyle: "outlined", imageRatio: "landscape", showSku: true };
        theme.trust = { showCodBadge: false, showPhoneConfirmationBadge: false, showDeliveryBadge: false, showSupportBadge: false };
        theme.builder.seo = { ...theme.builder.seo, noIndex: true };
      },
    });
    const html = page(store);
    expect(html).toContain('data-voice="oasis"');
    expect(html).toContain('data-radius="sharp"');
    expect(html).toContain('data-density="compact"');
    expect(html).toContain('data-card="outlined"');
    expect(html).toContain('data-ratio="landscape"');
    expect(html).not.toContain('class="sf-trust"');
    expect(html).toContain('<meta name="robots" content="noindex, nofollow">');
    expect(html).toContain("MIR-01");
    store.database.close();
  });

  it("hides prices when the seller turned them off", async () => {
    const store = await publishTestStore({ shapeTheme: (theme) => { theme.showPrices = false; } });
    expect(page(store)).not.toContain('class="sf-price"');
    store.database.close();
  });
});

describe("product page", () => {
  it("opens with the picture, the name, the price and an order bar, then the form", async () => {
    const store = await publishTestStore({ locale: "fr" });
    const html = page(store, { productId: "product_00000001" });
    const main = html.slice(html.indexOf("<main"), html.indexOf("</main>"));
    expect(main.indexOf("sf-gal")).toBeLessThan(main.indexOf("<h1"));
    expect(main.indexOf("<h1")).toBeLessThan(main.indexOf('data-sf="price"'));
    expect(main.indexOf('data-sf="price"')).toBeLessThan(main.indexOf('id="order"'));
    expect(count(html, /class="sf-slide"/g)).toBe(2);
    expect(html).toContain('<link rel="preload" as="image" href="https://images.example.test/miroir-1.jpg" fetchpriority="high">');
    expect(count(html, /fetchpriority="high"/g)).toBe(2); // the preload and the first slide
    expect(html).toContain('<div id="sf-sticky" class="sf-sticky">');
    expect(html).toContain('<a id="sf-bar-cta" class="sf-cta sf-cta--bar" href="#order">');
    expect(html).toContain('<script src="/_sf/shop.test.js" defer></script>');
    expect(html).toContain("data-sticky");
    expect(html).toContain(`<title>Miroir Mural Décoratif — متجر الساحل</title>`);
    store.database.close();
  });

  it("carries what the browser needs and nothing the buyer must not see", async () => {
    const store = await publishTestStore({ locale: "fr" });
    const html = page(store, { productId: "product_00000003" });
    const d = data(html);
    expect(d).toMatchObject({ v: 1, slug: "sahel-store", storefrontId: "storefront_12345678", releaseId: "release_12345678", locale: "fr", key: "desktop-key", cdir: "/_sf/c.test" });
    expect(d.items.map((item: { k: string }) => item.k)).toEqual(["product_00000003:variant_small", "product_00000003:variant_large"]);
    expect(d.items.find((item: { k: string }) => item.k.endsWith("small"))).toMatchObject({ l: "Petit", p: 8_000, r: 2 });
    expect(d.fees).toEqual({ "16": [500, null] });
    expect(d.i.order).toBe(createPublicTranslator("fr")("storefront.studio.orderNow"));
    expect(html).not.toContain("variant_retired");
    expect(JSON.stringify(d)).not.toMatch(/unit_price|delegated|PRIVATE|d1/i);
    store.database.close();
  });

  it("offers only wilayas the seller delivers to, and only the modes it offers there", async () => {
    const store = await publishTestStore({
      locale: "fr",
      shapeTheme: (theme) => {
        theme.builder.shippingRules = [
          { wilayaCode: "16", deliveryMode: "home", feeDzd: 500 },
          { wilayaCode: "16", deliveryMode: "desk", feeDzd: 300 },
          { wilayaCode: "31", deliveryMode: "desk", feeDzd: 0 },
        ];
      },
    });
    const html = page(store, { productId: "product_00000001" });
    expect(data(html).fees).toEqual({ "16": [500, 300], "31": [null, 0] });
    const options = [...html.matchAll(/<option value="(\d\d)">([^<]+)<\/option>/g)].map((m) => [m[1], m[2]]);
    expect(options).toEqual([["16", "16 · Alger"], ["31", "31 · Oran"]]);
    store.database.close();
  });

  it("uses Arabic names for wilayas in Arabic", async () => {
    const store = await publishTestStore({ locale: "ar" });
    const html = page(store, { productId: "product_00000001" });
    expect(html).toContain('<option value="16">16 · الجزائر</option>');
    store.database.close();
  });

  it("has a form every control of which is labelled, with unique ids and an error slot", async () => {
    const store = await publishTestStore({ locale: "fr" });
    const html = page(store, { productId: "product_00000001" });
    const form = html.slice(html.indexOf('<form id="order"'), html.indexOf("</form>"));
    const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const field of ["name", "phone", "wilaya", "commune", "address", "notes"]) {
      expect(form, field).toContain(`<label for="f-${field}">`);
      expect(form, field).toContain(`id="f-${field}"`);
      expect(form, field).toContain(`id="e-${field}"`);
    }
    expect(form).toContain('type="tel" inputmode="tel" enterkeyhint="next" autocomplete="tel-national"');
    expect(form).toContain('autocomplete="name"');
    expect(form).toContain('autocomplete="street-address"');
    expect(form).toContain('<form id="order" class="sf-form" novalidate');
    expect(form).toMatch(/<button id="sf-submit" class="sf-cta" type="submit" aria-describedby="sf-status">/);
    expect(count(form, /aria-label="[^"]+"/g)).toBeGreaterThanOrEqual(2); // the two quantity buttons
    expect(count(form, /<noscript>/g)).toBe(1);
    expect(form).not.toMatch(/\bonclick=|\bonsubmit=|javascript:/i);
    store.database.close();
  });

  it("shows the options as radio pills, retired ones gone, and a sold-out one disabled", async () => {
    const store = await publishTestStore({ locale: "fr" });
    store.database.prepare("UPDATE storefront_allocation SET remaining_quantity = 0 WHERE item_key = 'product_00000003:variant_large'").run();
    const html = page(store, { productId: "product_00000003" });
    expect(count(html, /<input type="radio" name="variant"/g)).toBe(2);
    expect(html).toMatch(/value="product_00000003:variant_large" disabled/);
    expect(html).toMatch(/value="product_00000003:variant_small" checked/);
    store.database.close();
  });

  it("states sold-out plainly and offers no form and no order bar", async () => {
    const store = await publishTestStore({ locale: "fr" });
    const html = page(store, { productId: "product_00000002" });
    expect(html).toContain('data-sold="1"');
    expect(html).not.toContain('<form id="order"');
    expect(html).not.toContain("sf-sticky");
    expect(html).toContain(createPublicTranslator("fr")("storefront.view.landing.soldOut"));
    expect(html).toContain("OutOfStock");
    store.database.close();
  });

  it("drops the order bar for the inline checkout layout and the notes field when the seller turned it off", async () => {
    const store = await publishTestStore({ shapeTheme: (theme) => { theme.checkout = { ...theme.checkout, layout: "inline", showOrderNotes: false }; } });
    const html = page(store, { productId: "product_00000001" });
    expect(html).not.toContain("sf-sticky");
    expect(html).not.toContain("data-sticky");
    expect(html).not.toContain('id="f-notes"');
    store.database.close();
  });

  it("describes the product to search engines", async () => {
    const store = await publishTestStore({ locale: "fr" });
    const html = page(store, { productId: "product_00000003" });
    const ld = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? "{}");
    const product = ld["@graph"].find((entry: { "@type": string }) => entry["@type"] === "Product");
    expect(product.offers).toMatchObject({ "@type": "AggregateOffer", lowPrice: 8_000, highPrice: 9_500, offerCount: 2, priceCurrency: "DZD", availability: "https://schema.org/InStock" });
    expect(ld["@graph"].find((entry: { "@type": string }) => entry["@type"] === "BreadcrumbList").itemListElement).toHaveLength(2);
    store.database.close();
  });

  it("lists the other products below, but not itself", async () => {
    const store = await publishTestStore({ locale: "fr" });
    const html = page(store, { productId: "product_00000001" });
    const more = html.slice(html.indexOf("sf-rail"));
    expect(more).toContain("/sahel-store/p/product_00000002");
    expect(more).toContain("/sahel-store/p/product_00000003");
    expect(more).not.toContain("/sahel-store/p/product_00000001");
    store.database.close();
  });

  it("answers null for a product the release does not hold", async () => {
    const store = await publishTestStore();
    expect(renderStorePage(renderInputFor(store, { productId: "product_00000099" }))).toBeNull();
    store.database.close();
  });
});

describe("a one-product store is an ad landing page", () => {
  it("makes its home the product page, with one canonical address", async () => {
    const store = await publishTestStore({ locale: "fr", products: SAMPLE_PRODUCTS.slice(0, 1) });
    const home = page(store);
    const direct = page(store, { productId: "product_00000001" });
    expect(home).toContain('<form id="order"');
    expect(home).toContain('data-page="product"');
    expect(home).not.toContain("sf-back");
    expect(home).toContain('<link rel="canonical" href="https://shop.test/sahel-store">');
    expect(direct).toContain('<link rel="canonical" href="https://shop.test/sahel-store">');
    store.database.close();
  });
});

describe("seller text is data, never markup", () => {
  it("escapes it everywhere on the home and on the product page, in every language", async () => {
    const store = await publishTestStore({
      storeName: HOSTILE,
      description: HOSTILE,
      products: [
        { id: "product_00000001", name: HOSTILE, sku: HOSTILE, images: null, price: 100, stock: 5, productVariants: [] },
        { id: "product_00000002", name: "Second", sku: null, images: null, price: 100, stock: 5, productVariants: [{ id: "variant_a", name: HOSTILE, price: 100, stock: 5, isActive: true }, { id: "variant_b", name: "B", price: 100, stock: 5, isActive: true }] },
      ],
      shapeTheme: (theme) => {
        theme.announcement = { enabled: true, text: HOSTILE };
        theme.hero = { ...theme.hero, eyebrow: HOSTILE, headline: HOSTILE, body: HOSTILE, ctaLabel: HOSTILE };
        theme.builder.seo = { title: HOSTILE, description: HOSTILE, socialImageUrl: null, noIndex: false };
        theme.builder.contact = { phone: HOSTILE, whatsapp: "javascript:alert(1)", email: HOSTILE, address: HOSTILE };
        theme.checkout = { ...theme.checkout, codPromiseText: HOSTILE };
      },
    });
    for (const locale of ["ar", "fr", "en"] as const) {
      for (const productId of [null, "product_00000001", "product_00000002"]) {
        const html = page(store, { locale, productId });
        expect(html, `${locale} ${productId}`).not.toContain("<img src=x");
        expect(html).not.toContain("<script>alert");
        expect(html).not.toMatch(/(?:href|src|action)\s*=\s*["']?\s*javascript:/i);
        expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
        // exactly: json-ld, plus the data block and the script tag on a product page
        expect(count(html, /<\/script>/g)).toBe(productId ? 3 : 1);
        if (productId) expect(JSON.parse(/id="sf-data">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? "").name).toBeTypeOf("string");
      }
    }
    store.database.close();
  });

  it("keeps a hostile media-section image URL out of every src", async () => {
    const store = await publishTestStore({
      shapeTheme: (theme) => {
        theme.builder.composition.sections = [
          ...theme.builder.composition.sections,
          { id: "media_hostile", type: "media" as const, enabled: true, settings: { imageUrl: "https://images.example.test/media.jpg", title: "Notre histoire", body: "..." }, blocks: [] },
        ];
      },
    });
    expect(page(store)).toContain('src="https://images.example.test/media.jpg"');
    store.database.exec("UPDATE storefront_release SET artifact_json = replace(artifact_json, 'https://images.example.test/media.jpg', 'javascript:alert(1)')");
    const html = page(store);
    expect(html).not.toContain("javascript:alert");
    expect(html).toContain("Notre histoire");
    store.database.close();
  });

  it("keeps a hostile image URL out of every src", async () => {
    const store = await publishTestStore();
    store.database.exec("UPDATE storefront_release SET artifact_json = replace(artifact_json, 'https://images.example.test/miroir-1.jpg', 'javascript:alert(1)')");
    const input = renderInputFor(store, { productId: "product_00000001" });
    const html = renderStorePage(input) ?? "";
    expect(html).not.toMatch(/src="javascript:/i);
    expect(html).not.toContain("javascript:alert");
    store.database.close();
  });
});

describe("weight", () => {
  it("keeps a product page small enough for a 3G phone", async () => {
    const store = await publishTestStore({ locale: "ar" });
    const html = page(store, { productId: "product_00000001" });
    const gz = gzipSync(html).length;
    console.warn(`[weight] product page ${html.length} bytes, ${gz} gzip`);
    expect(gz).toBeLessThan(12_000);
    const home = page(store);
    expect(gzipSync(home).length).toBeLessThan(10_000);
    store.database.close();
  });
});
