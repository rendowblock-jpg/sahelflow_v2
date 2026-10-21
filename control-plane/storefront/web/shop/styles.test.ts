import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { renderStorePage } from "./index";
import { publishTestStore, renderInputFor, SAMPLE_PRODUCTS } from "../test-support";

const STYLES = ["noir", "lumen", "atelier", "pulse", "bloom"] as const;
type Style = (typeof STYLES)[number];
const OLD = ["sahara", "atlas", "oasis", "prime", "souk", "reel"] as const;
/** The class on the <article> of each style's product page: five different structures, five different roots. */
const ROOT: Record<Style, string> = { noir: "nx", lumen: "lx", atelier: "ax", pulse: "px", bloom: "bx" };
const FONT: Record<Style, string> = { noir: "noir-500", lumen: "lumen-700", atelier: "atelier-700", pulse: "pulse-900", bloom: "bloom-700" };
const SOLD_OUT = "product_00000002";

/** A sample product by position; fails loudly instead of returning undefined. */
function sample(index: number): (typeof SAMPLE_PRODUCTS)[number] {
  const product = SAMPLE_PRODUCTS[index];
  if (!product) throw new Error(`no sample product ${index}`);
  return product;
}

type Store = Awaited<ReturnType<typeof publishTestStore>>;
type Options = { eyebrow?: string; badges?: "all" | "cod-only"; mode?: "landing" | "store" | "absent"; locale?: "ar" | "fr"; contact?: boolean; headline?: string; storeName?: string; products?: Parameters<typeof publishTestStore>[0] extends infer O ? (O extends { products?: infer P } ? P : never) : never };

async function publish(template: Style | (typeof OLD)[number], options: Options = {}): Promise<Store> {
  return publishTestStore({
    template,
    locale: options.locale ?? "ar",
    ...(options.storeName ? { storeName: options.storeName } : {}),
    ...(options.products ? { products: options.products } : {}),
    shapeTheme: (theme) => {
      const bag = theme as unknown as { mode?: string };
      if (options.mode === "absent") delete bag.mode;
      else if (options.mode) bag.mode = options.mode;
      theme.builder.contact = options.contact === false ? { phone: "", whatsapp: "", email: "", address: "" } : { phone: "0550123456", whatsapp: "0550123456", email: "a@b.test", address: "Alger" };
      if (options.headline) theme.hero.headline = options.headline;
      if (options.eyebrow !== undefined) theme.hero.eyebrow = options.eyebrow;
      if (options.badges === "cod-only") theme.trust = { showCodBadge: true, showPhoneConfirmationBadge: false, showDeliveryBadge: false, showSupportBadge: false };
    },
  });
}

function page(store: Store, productId: string | null = null): string {
  const html = renderStorePage(renderInputFor(store, { productId }));
  if (html === null) throw new Error("page not found");
  return html;
}

const count = (html: string, pattern: RegExp) => (html.match(pattern) ?? []).length;
const links = (html: string) => [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((m) => m[1]);
const scripts = (html: string) => [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
const preloads = (html: string) => [...html.matchAll(/<link rel="preload" as="font"[^>]*href="([^"]+)"/g)].map((m) => m[1]);

describe("each style is drawn as itself", () => {
  it.each(STYLES)("%s: its own voice, its stylesheet after the shared one, its heading font preloaded (Arabic and French)", async (style) => {
    for (const locale of ["ar", "fr"] as const) {
      const store = await publish(style, { locale });
      const html = page(store);
      expect(html).toContain(`data-voice="${style}"`);
      expect(links(html)).toEqual(["/_sf/shop.test.css", `/_sf/${style}.test.css`]);
      expect(preloads(html)).toEqual([`/_sf/f.test.${FONT[style]}.woff2`]);
      store.database.close();
    }
  });

  it("only Noir has a script of its own, and it loads after the order script", async () => {
    const noir = await publish("noir", { mode: "landing" });
    expect(scripts(page(noir))).toEqual(["/_sf/shop.test.js", "/_sf/noir.test.js"]);
    noir.database.close();
    for (const style of ["lumen", "atelier", "pulse", "bloom"] as const) {
      const store = await publish(style, { mode: "landing" });
      expect(scripts(page(store))).toEqual(["/_sf/shop.test.js"]);
      store.database.close();
    }
  });

  it("Noir's script also loads on a store's catalogue page, which has no order script", async () => {
    const store = await publish("noir", { mode: "store" });
    expect(scripts(page(store))).toEqual(["/_sf/noir.test.js"]);
    store.database.close();
  });
});

describe("landing page: one scrollable page that sells one product", () => {
  it.each(STYLES)("%s: the home IS the first product's page, with the order form and one way to jump to it", async (style) => {
    const store = await publish(style, { mode: "landing" });
    const html = page(store);
    expect(html).toContain('data-mode="landing"');
    expect(html).toContain(`<article class="${ROOT[style]}"`);
    expect(count(html, /id="order"/g)).toBe(1);
    expect(count(html, /<h1[ >]/g)).toBe(1);
    expect(html).toContain("Miroir Mural Décoratif");
    expect(html).toContain('<a class="sf-hcta" href="#order">');
    expect(html).not.toContain('class="sf-nav"');
    expect(html).not.toContain('id="catalog"');
    expect(html).toContain('<link rel="canonical" href="https://shop.test/sahel-store">');
    store.database.close();
  });

  it.each(STYLES)("%s: a theme with no mode is a landing page", async (style) => {
    const store = await publish(style, { mode: "absent" });
    const html = page(store);
    expect(html).toContain('data-mode="landing"');
    expect(html).toContain(`<article class="${ROOT[style]}"`);
    store.database.close();
  });

  it.each(STYLES)("%s: a landing page whose first product is sold out offers no order button anywhere", async (style) => {
    const sold = [{ ...sample(1), id: "product_00000009" }, sample(0)];
    const store = await publish(style, { mode: "landing", products: sold });
    const html = page(store);
    expect(html).toContain('data-sold="1"');
    expect(html).not.toContain('href="#order"');
    expect(html).not.toContain('id="sf-sticky"');
    expect(html).not.toContain('id="order"');
    store.database.close();
  });
});

describe("store: home, catalogue, product pages", () => {
  it.each(STYLES)("%s: the home is the catalogue, with all the products and two header links, and no order form", async (style) => {
    const store = await publish(style, { mode: "store" });
    const html = page(store);
    expect(html).toContain('data-mode="store"');
    expect(html).toContain('id="catalog"');
    expect(html).not.toContain('id="order"');
    expect(html).not.toContain('class="sf-hcta"');
    expect(count(html, /<h1[ >]/g)).toBe(1);
    for (const id of ["product_00000001", "product_00000002", "product_00000003"]) expect(html).toContain(`href="/sahel-store/p/${id}"`);
    expect(html).toContain('<nav class="sf-nav"');
    expect(html).toContain('href="/sahel-store#catalog"');
    expect(html).toContain('href="/sahel-store#contact"');
    expect(html).toContain('<link rel="canonical" href="https://shop.test/sahel-store">');
    store.database.close();
  });

  it.each(STYLES)("%s: a store with ONE product still opens on its catalogue (the seller chose a store)", async (style) => {
    const store = await publish(style, { mode: "store", products: [sample(0)] });
    const html = page(store);
    expect(html).toContain('id="catalog"');
    expect(html).not.toContain('id="order"');
    store.database.close();
  });

  it.each(STYLES)("%s: a product page of a store has the full order form and a canonical address of its own", async (style) => {
    const store = await publish(style, { mode: "store" });
    const html = page(store, "product_00000003");
    expect(html).toContain(`<article class="${ROOT[style]}"`);
    expect(count(html, /id="order"/g)).toBe(1);
    expect(count(html, /id="sf-data"/g)).toBe(1);
    expect(html).toContain('<link rel="canonical" href="https://shop.test/sahel-store/p/product_00000003">');
    expect(html).toContain('<nav class="sf-nav"');
    store.database.close();
  });

  it.each(STYLES)("%s: without any contact detail the header has the catalogue link only", async (style) => {
    const store = await publish(style, { mode: "store", contact: false });
    const html = page(store);
    expect(count(html, /<nav class="sf-nav"[^>]*>(?:<a [^>]*>[^<]*<\/a>)+<\/nav>/g)).toBe(1);
    expect(html).not.toContain('href="/sahel-store#contact"');
    store.database.close();
  });

  it("Lumen lists its catalogue as an index; the other four use cards", async () => {
    for (const style of STYLES) {
      const store = await publish(style, { mode: "store" });
      const html = page(store);
      if (style === "lumen") {
        expect(html).toContain('class="lx-index"');
        expect(html).not.toContain('class="sf-grid"');
        expect(count(html, /class="lx-row"/g)).toBe(3);
      } else {
        expect(html).toContain('class="sf-grid"');
        expect(html).not.toContain("lx-index");
      }
      store.database.close();
    }
  });
});

describe("five structures, not one skeleton in five colours", () => {
  it("each style's product page has its own root and none of the other four", async () => {
    const pages = new Map<Style, string>();
    for (const style of STYLES) {
      const store = await publish(style, { mode: "landing" });
      pages.set(style, page(store));
      store.database.close();
    }
    for (const style of STYLES) {
      const html = pages.get(style) ?? "";
      for (const other of STYLES) {
        if (other === style) continue;
        expect(html).not.toContain(`<article class="${ROOT[other]}"`);
      }
    }
    // the markup between the style's header and footer differs from every other style's
    const bodies = [...pages.values()].map((html) => html.slice(html.indexOf("<main"), html.indexOf("</main>")).replace(/>[^<]*</g, "><"));
    expect(new Set(bodies).size).toBe(5);
  });

  it.each(STYLES)("%s: every page of a style, in both modes and both languages, has one order form, one data block, one gallery and one h1", async (style) => {
    for (const mode of ["landing", "store"] as const) {
      for (const locale of ["ar", "fr"] as const) {
        const store = await publish(style, { mode, locale });
        const html = page(store, "product_00000001");
        expect(count(html, /id="order"/g)).toBe(1);
        expect(count(html, /id="sf-data"/g)).toBe(1);
        expect(count(html, /class="sf-gal-track"/g)).toBe(1);
        expect(count(html, /<h1[ >]/g)).toBe(1);
        store.database.close();
      }
    }
  });

  it.each(STYLES)("%s: a product without a photo draws the letter placeholder and still renders", async (style) => {
    const store = await publish(style, { mode: "store" });
    const html = page(store, SOLD_OUT);
    expect(html).toContain("sf-ph");
    expect(html).toContain('data-sold="1"');
    store.database.close();
  });
});

describe("what a seller or a buyer types is never markup", () => {
  const EVIL = '<img src=x onerror=alert(1)> "q" \'s\' &amp;';
  const product = { ...sample(0), name: EVIL, sku: "S<1>", images: JSON.stringify(["https://images.example.test/a.jpg"]) };

  it.each(STYLES)("%s: product name, store name and hero headline are escaped on the landing page, the catalogue and the product page", async (style) => {
    for (const mode of ["landing", "store"] as const) {
      const store = await publish(style, { mode, headline: EVIL, storeName: EVIL, products: [product] });
      for (const html of [page(store), page(store, "product_00000001")]) {
        expect(html).not.toContain("<img src=x onerror");
        expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
      }
      store.database.close();
    }
  });
});

describe("the older templates are not touched by the styles", () => {
  it.each(OLD)("%s: no mode attribute, no header link, no style class, even if the theme carries a mode", async (template) => {
    const store = await publish(template, { mode: "store", products: [sample(0)] });
    const html = page(store);
    expect(html).not.toContain("data-mode");
    expect(html).not.toContain("sf-hcta");
    expect(html).not.toContain('class="sf-nav"');
    expect(html).not.toMatch(/<article class="(nx|lx|ax|px|bx)"/);
    // one product and the older templates: the home is still the product page, whatever the mode says
    expect(html).toContain('id="order"');
    store.database.close();
  });
});

describe("craft floor: no label above a heading, numbers only for a real sequence", () => {
  it.each(STYLES)("%s: no eyebrow-style label is drawn before the h1, on the landing page, the catalogue or the product page", async (style) => {
    for (const mode of ["landing", "store"] as const) {
      const store = await publish(style, { mode, eyebrow: "" });
      for (const html of [page(store), page(store, "product_00000001")]) {
        expect(html).not.toMatch(/-kicker/);
        expect(html).not.toContain("№");
        expect(html).not.toContain('class="sf-tag"');
      }
      store.database.close();
    }
  });

  it.each(STYLES)("%s: a tagline the seller wrote is drawn once, under the name, and nothing is invented when they wrote none", async (style) => {
    const store = await publish(style, { mode: "landing", eyebrow: "عبارة البائع" });
    const html = page(store);
    expect(count(html, /class="sf-tag"/g)).toBe(1);
    expect(html.indexOf("</h1>")).toBeLessThan(html.indexOf('class="sf-tag"'));
    store.database.close();
  });

  it("Atelier numbers the three promises that happen in order (call, delivery, cash); support is a plain line; one promise alone gets no number", async () => {
    const all = await publish("atelier", { mode: "landing", badges: "all" });
    const html = page(all);
    expect(count(html, /class="ax-n"/g)).toBe(3);
    expect(count(html, /<li class="sf-rv">/g)).toBeGreaterThanOrEqual(4);
    all.database.close();
    const one = await publish("atelier", { mode: "landing", badges: "cod-only" });
    expect(count(page(one), /class="ax-n"/g)).toBe(0);
    one.database.close();
  });
});

describe("the style sheets keep their promises", () => {
  const css = (id: Style) => readFileSync(join(process.cwd(), "control-plane/storefront/web/styles", `${id}.css`), "utf8");

  it.each(STYLES)("%s: main clips sideways overflow (a phone browser stretches its layout viewport, and the fixed order bar with it, to the widest thing it finds, even for one animation frame; measured on Atelier: the price stamp's entrance made the page 376 px wide on a 360 px phone)", (style) => {
    expect(css(style)).toContain(`body[data-voice=${style}] main{overflow-x:clip}`);
    expect(css(style)).not.toContain(`body[data-voice=${style}]{overflow-x`);
  });

  it.each(STYLES)("%s: no letter-spacing tighter than -0.04em", (style) => {
    const values = [...css(style).matchAll(/letter-spacing:(-?[\d.]+)em/g)].map((m) => Number(m[1]));
    expect(values.length).toBeGreaterThan(0);
    for (const value of values) expect(value).toBeGreaterThanOrEqual(-0.04);
  });

  it.each(STYLES)("%s: caret and check marks follow the palette, and the photo placeholder shimmer is off (a cut-out photo is transparent)", (style) => {
    const text = css(style);
    expect(text).toContain(`body[data-voice=${style}]{caret-color:var(--primary);accent-color:var(--primary)}`);
    expect(text).toMatch(new RegExp(`body\\[data-voice=${style}\\] :is\\(\\.sf-media,\\.sf-slide,\\.sf-hero-pic,\\.sf-panel-pic\\)\\{background-image:none;animation:none\\}`));
  });
});
