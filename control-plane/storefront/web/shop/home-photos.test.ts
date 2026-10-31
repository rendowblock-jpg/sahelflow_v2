import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";

import manifest from "../asset-manifest.generated.json";
import { publishTestStore, renderInputFor } from "../test-support";
import { renderStorePage } from "./index";

const STYLES = ["sahara", "atlas", "oasis", "prime", "souk", "reel", "noir", "lumen", "atelier", "pulse", "bloom"] as const;
const WEB = fileURLToPath(new URL("..", import.meta.url));

async function pages(template: (typeof STYLES)[number], locale: "ar" | "fr" | "en" = "fr", mode: "store" | "landing" = "store"): Promise<{ home: string; product: string }> {
  const store = await publishTestStore({
    template,
    locale,
    shapeTheme: (theme) => {
      (theme as unknown as { mode?: string }).mode = mode;
    },
  });
  try {
    const home = renderStorePage(renderInputFor(store));
    const product = renderStorePage(renderInputFor(store, { productId: "product_00000001" }));
    if (home === null || product === null) throw new Error(`${template}: no page`);
    return { home, product };
  } finally {
    store.database.close();
  }
}
const scripts = (html: string) => (html.match(/<script\b[^>]*>/g) ?? []).filter((tag) => !tag.includes("application/ld+json") && !tag.includes('id="sf-data"'));

describe("the home page and a photo that does not load", () => {
  it.each(STYLES)("%s (catalogue): the home page loads the tiny photo script, and a product page its own bundle only", async (style) => {
    const { home, product } = await pages(style);
    expect(home).toContain('<script src="/_sf/photos.test.js" defer></script>');
    expect(scripts(home).filter((tag) => tag.includes("src=")).every((tag) => tag.includes("defer"))).toBe(true);
    expect(scripts(home).filter((tag) => !tag.includes("src="))).toEqual([]); // the page policy has no inline script
    expect(product).toContain('<script src="/_sf/shop.test.js" defer></script>');
    expect(product).not.toContain("photos.test.js");
  });

  // A landing-mode home IS the order page of one product: it runs the order script, and that script starts the same watcher.
  it.each(["lumen", "atelier", "pulse", "bloom", "noir"] as const)("%s (landing): the home is the order page, so it runs the order script (which watches photos) and not a second photo script", async (style) => {
    const { home } = await pages(style, "fr", "landing");
    const srcs = scripts(home).filter((tag) => tag.includes("src="));
    expect(srcs[0]).toBe('<script src="/_sf/shop.test.js" defer>');
    expect(home).not.toContain("photos.test.js");
    expect(srcs).toHaveLength(style === "noir" ? 2 : 1); // Noir adds its own motion script after the order script
    expect(readFileSync(join(WEB, "client/shop.ts"), "utf8")).toContain("watchPhotos()");
  });

  it.each(STYLES)("%s: a product with no photo at all is drawn as a lettered placeholder on the server, not as an empty <img>", async (style) => {
    const { home } = await pages(style, "ar");
    expect(home).toContain('class="sf-ph"');
    expect(home).not.toMatch(/<img\b[^>]*\bsrc=""/);
    expect(home).not.toMatch(/<img\b(?![^>]*\bsrc=)/);
  });

  it("the placeholder is aria-hidden (its name is printed beside it) and shows the first letter of the product", async () => {
    const { home } = await pages("sahara", "fr");
    expect(home).toContain('<span class="sf-ph" aria-hidden="true">T</span>'); // Tapis berbère has no photo
  });

  it("costs the home page well under 600 bytes of gzip, one request, and the product bundle did not grow by it", () => {
    const photosJs = readFileSync(join(process.cwd(), "control-plane/storefront/public", manifest.photos), "utf8");
    const gz = gzipSync(photosJs).length;
    console.warn(`[weight] home photo script ${photosJs.length} bytes, ${gz} gzip`);
    expect(gz).toBeLessThan(600);
    expect(photosJs).toContain("photo-missing");
    expect(photosJs).not.toContain("Idempotency"); // none of the checkout code rides along
    expect(readFileSync(join(WEB, "client/home-photos.ts"), "utf8")).toContain("watchPhotos()");
  });
});

describe("the buyer pages are light only and say so", () => {
  it.each(STYLES)("%s: the page declares color-scheme light once, in the head", async (style) => {
    const { home, product } = await pages(style);
    for (const html of [home, product]) {
      expect(html.match(/<meta name="color-scheme" content="light">/g)).toHaveLength(1);
      expect(html.indexOf('<meta name="color-scheme"')).toBeLessThan(html.indexOf("</head>"));
    }
  });
  it("the stylesheet's root rule sets color-scheme: light and no sheet builds a dark theme", () => {
    const shop = readFileSync(join(WEB, "styles/shop.css"), "utf8");
    expect(/:root\{\s*color-scheme:light;/.test(shop)).toBe(true);
    for (const id of ["shop", "prime", "souk", "reel", "noir", "lumen", "atelier", "pulse", "bloom"]) {
      expect(readFileSync(join(WEB, "styles", `${id}.css`), "utf8"), id).not.toContain("prefers-color-scheme");
    }
  });
});
