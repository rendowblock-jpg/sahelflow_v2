import { describe, expect, it } from "vitest";

import { createDefaultStorefrontTheme } from "@/lib/storefront/theme-default";
import { STOREFRONT_TEMPLATE_PRESETS } from "@/lib/storefront/template-presets";

import { SAMPLE_PRODUCTS, publishTestStore, renderInputFor } from "../test-support";
import { renderStorePage } from "./index";

const TEMPLATES = ["sahara", "atlas", "oasis"] as const;

async function home(options: Parameters<typeof publishTestStore>[0] = {}): Promise<string> {
  const store = await publishTestStore(options);
  const html = renderStorePage(renderInputFor(store, { productId: null })) ?? "";
  store.database.close();
  return html;
}

describe("premium chrome (redesign v3, 20 Oct 2026)", () => {
  it.each(TEMPLATES)("%s: the shop name is the mark; there is no monogram circle", async (template) => {
    const html = await home({ template });
    expect(html).not.toContain("sf-mono");
    expect(html).toMatch(/<a class="sf-brand" href="\/sahel-store"><b dir="auto">[^<]+<\/b><\/a>/);
  });

  it("shows the announcement once, as a static line, not as a marquee", async () => {
    const html = await home({
      shapeTheme: (theme) => {
        theme.announcement = { enabled: true, text: "Livraison dans les 58 wilayas" };
      },
    });
    expect(html.split("Livraison dans les 58 wilayas").length - 1).toBe(1);
    expect(html).toContain('class="sf-ann"');
    expect(html).not.toContain("sf-ann-track");
    expect(html).not.toContain("sf-ann-set");
  });

  it.each(TEMPLATES)("%s: writes no kicker above the headline unless the seller wrote one", async (template) => {
    expect(await home({ template })).not.toContain("sf-eyebrow");
    const written = await home({
      template,
      shapeTheme: (theme) => {
        theme.hero.eyebrow = "Nouvelle collection";
      },
    });
    expect(written).toContain('<p class="sf-eyebrow" dir="auto">Nouvelle collection</p>');
  });

  it.each(TEMPLATES)("%s: no glow blobs and no floating price chip", async (template) => {
    const html = await home({ template });
    expect(html).not.toContain("sf-blob");
    expect(html).not.toContain("sf-chip-price");
  });

  it.each(TEMPLATES)("%s: the hero photo is captioned with the first product's name and price, linked to its page", async (template) => {
    const html = await home({ template });
    expect(html).toContain(
      '<a class="sf-hero-cap" href="/sahel-store/p/product_00000001"><span dir="auto">Miroir Mural Décoratif</span><b>2.500 دج</b></a>',
    );
  });

  it("drops the price from the caption when the seller hides prices", async () => {
    const html = await home({
      shapeTheme: (theme) => {
        theme.showPrices = false;
      },
    });
    expect(html).toContain('<a class="sf-hero-cap" href="/sahel-store/p/product_00000001"><span dir="auto">Miroir Mural Décoratif</span></a>');
  });

  it("puts no order button on a product card: the card is the link", async () => {
    const html = await home();
    expect(html).toContain('class="sf-card"');
    expect(html).not.toContain("sf-card-cta");
  });

  it("keeps the first product with a photo as the caption even when an earlier product has none", async () => {
    const products = [{ ...SAMPLE_PRODUCTS[1]! }, { ...SAMPLE_PRODUCTS[0]! }];
    const html = await home({ products });
    expect(html).toContain('href="/sahel-store/p/product_00000001"><span dir="auto">Miroir Mural Décoratif</span>');
  });
});

describe("the three templates open as three different worlds", () => {
  it("differ in hero, palette and shape, not only in tint", () => {
    const themes = TEMPLATES.map((template) => createDefaultStorefrontTheme(template));
    expect(new Set(themes.map((theme) => theme.hero.style)).size).toBe(3);
    expect(new Set(TEMPLATES.map((template) => STOREFRONT_TEMPLATE_PRESETS[template].primaryColor)).size).toBe(3);
    expect(new Set(TEMPLATES.map((template) => STOREFRONT_TEMPLATE_PRESETS[template].backgroundColor)).size).toBe(3);
  });

  it("opens atlas and sahara square-cornered and oasis soft, each with an announcement line", () => {
    expect(createDefaultStorefrontTheme("sahara").radius).toBe("sharp");
    expect(createDefaultStorefrontTheme("atlas").radius).toBe("sharp");
    expect(createDefaultStorefrontTheme("oasis").radius).toBe("soft");
    for (const template of TEMPLATES) expect(createDefaultStorefrontTheme(template).announcement.enabled).toBe(true);
  });

  it("no longer opens on the old warm-cream and terracotta palette", () => {
    for (const template of TEMPLATES) {
      const palette = STOREFRONT_TEMPLATE_PRESETS[template];
      expect(palette.primaryColor.toUpperCase()).not.toBe("#7C3F22");
      expect(palette.backgroundColor.toUpperCase()).not.toBe("#FFF8F1");
    }
  });
});
