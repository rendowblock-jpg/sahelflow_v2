import { describe, expect, it } from "vitest";

import manifest from "./asset-manifest.generated.json";
import { servePublicStorePage } from "./serve-page";
import { productHref } from "./shop/ui";
import { publishTestStore } from "./test-support";

/**
 * Which scripts the hosted page carries, seen through the Worker's own entry (serve-page.ts) with the REAL build
 * manifest. The older page tests hand the renderer their own assets (`/_sf/photos.test.js`), so when the Worker's hand-written
 * asset list forgot `photos` they all stayed green while the home page of a store lost its photo-fallback script.
 */
const STORE_STYLES = ["sahara", "atlas", "oasis", "prime", "souk", "reel"] as const;
const LANDING_STYLES = ["lumen", "atelier", "pulse", "bloom", "noir"] as const;
type Style = (typeof STORE_STYLES)[number] | (typeof LANDING_STYLES)[number];

async function serve(style: Style, mode: "store" | "landing", productId: string | null): Promise<string> {
  const store = await publishTestStore({
    template: style,
    locale: "fr",
    shapeTheme: (theme) => {
      (theme as unknown as { mode?: string }).mode = mode;
    },
  });
  try {
    const path = productId ? productHref(store.slug, productId) : `/${store.slug}`;
    const response = await servePublicStorePage(new Request(`https://shop.test${path}?lang=fr`), store.env, store.slug, undefined, productId);
    expect(response.status).toBe(200);
    return await response.text();
  } finally {
    store.database.close();
  }
}

/** The src of every external script tag, in page order. */
function scriptSrcs(html: string): string[] {
  return (html.match(/<script\b[^>]*\bsrc="[^"]+"[^>]*>/g) ?? []).map((tag) => /\bsrc="([^"]+)"/.exec(tag)?.[1] ?? "");
}
const count = (list: readonly string[], value: string): number => list.filter((item) => item === value).length;
/** A style may add its own motion script after the order script (reel, noir). */
const ownSkinScripts = (style: Style): string[] => {
  const skin = (manifest.skins as Record<string, { js?: string } | undefined>)[style];
  return skin?.js ? [skin.js] : [];
};

describe("the scripts of the hosted page, through the Worker's entry with the real manifest", () => {
  it.each(STORE_STYLES)("%s (store mode): the home page has the photo script exactly once and not the order script; the product page has the order script and not a second photo script", async (style) => {
    const home = scriptSrcs(await serve(style, "store", null));
    expect(manifest.photos).toMatch(/^\/_sf\/photos\.[0-9a-f]{10}\.js$/);
    expect(count(home, manifest.photos)).toBe(1);
    expect(count(home, manifest.js)).toBe(0);
    expect(home.filter((src) => src !== manifest.photos)).toEqual([]); // a style's motion script (reel) lives on its product page, not on the home page

    const product = scriptSrcs(await serve(style, "store", "product_00000001"));
    expect(count(product, manifest.js)).toBe(1);
    expect(count(product, manifest.photos)).toBe(0); // the order script already watches photos
    expect(product.filter((src) => src !== manifest.js)).toEqual(ownSkinScripts(style));
  });

  it.each(LANDING_STYLES)("%s (landing mode): the home page is the order page: the order script once, no photo script, nothing else of ours", async (style) => {
    const home = scriptSrcs(await serve(style, "landing", null));
    expect(count(home, manifest.js)).toBe(1);
    expect(count(home, manifest.photos)).toBe(0);
    expect(home.filter((src) => src !== manifest.js)).toEqual(ownSkinScripts(style));
  });
});
