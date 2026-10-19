import { describe, expect, it } from "vitest";

import { SAMPLE_PRODUCTS, publishTestStore, renderInputFor } from "../test-support";
import { renderStorePage } from "./index";
import { imgAttrs, preloadImage } from "./ui";

const HASH = "0123456789abcdef01234567";
const BIG = `https://media.test/m/storefront_12345678/${HASH}-1280.webp`;
const SMALL = `https://media.test/m/storefront_12345678/${HASH}-640.webp`;

describe("responsive photos", () => {
  it("gives a hosted photo both widths, and a seller's own link just a source", () => {
    expect(imgAttrs(BIG, "100vw")).toBe(`src="${BIG}" srcset="${SMALL} 640w, ${BIG} 1280w" sizes="100vw"`);
    expect(imgAttrs(BIG, "48px", 640)).toBe(`src="${SMALL}" srcset="${SMALL} 640w, ${BIG} 1280w" sizes="48px"`);
    expect(imgAttrs("https://img.example.com/photo.jpg", "100vw")).toBe('src="https://img.example.com/photo.jpg"');
    // a look-alike path on another file type or with a short hash is not ours
    expect(imgAttrs(`https://media.test/m/s/${HASH}-1280.jpg`, "100vw")).not.toContain("srcset");
    expect(imgAttrs(`https://media.test/m/s/abc-1280.webp`, "100vw")).not.toContain("srcset");
  });

  it("escapes what it prints", () => {
    expect(imgAttrs('https://x.test/a"onerror="1.jpg', "100vw")).not.toContain('"onerror');
  });

  it("preloads the same choice of widths the picture will make", () => {
    expect(preloadImage(BIG, "100vw")).toBe(
      `<link rel="preload" as="image" href="${BIG}" imagesrcset="${SMALL} 640w, ${BIG} 1280w" imagesizes="100vw" fetchpriority="high">`,
    );
    expect(preloadImage("https://img.example.com/a.jpg", "100vw")).toBe(
      '<link rel="preload" as="image" href="https://img.example.com/a.jpg" fetchpriority="high">',
    );
  });

  it("uses them on the product page, the cards, the sticky bar and the preload", async () => {
    const products = SAMPLE_PRODUCTS.map((product, index) =>
      index === 0 ? { ...product, images: JSON.stringify([BIG]) } : product,
    );
    const store = await publishTestStore({ products });
    const first = SAMPLE_PRODUCTS[0]?.id as string;
    const product = renderStorePage(renderInputFor(store, { productId: first })) ?? "";
    expect(product).toContain(`srcset="${SMALL} 640w, ${BIG} 1280w" sizes="(min-width:900px) 540px, 100vw"`);
    expect(product).toContain(`<link rel="preload" as="image" href="${BIG}" imagesrcset=`);
    expect(product).toMatch(/class="sf-sticky-thumb" src="https:\/\/media\.test\/m\/storefront_12345678\/[0-9a-f]{24}-640\.webp" srcset=/);
    const home = renderStorePage(renderInputFor(store, { productId: null })) ?? "";
    expect(home).toContain('sizes="(min-width:1040px) 25vw, (min-width:720px) 33vw, 50vw"');
    store.database.close();
  });

  it("leaves a store with its own photo links exactly as before", async () => {
    const store = await publishTestStore();
    const home = renderStorePage(renderInputFor(store, { productId: null })) ?? "";
    expect(home).not.toContain("srcset=");
    store.database.close();
  });
});
