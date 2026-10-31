/**
 * Renders the fixture storefronts to static HTML files so a page can be measured without Cloudflare:
 * every style x language x page (home, four product pages, the three notice pages), written beside the
 * built /_sf assets, plus index.json (file, style, language, page, status). Photos in the fixtures point at
 * an unreachable host, so they are rewritten to local SVGs, except one product whose photo is left missing on purpose.
 */
import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { STOREFRONT_TEMPLATE_IDS } from "../../../../src/lib/storefront/presentation-types";
import type { StorefrontReleaseProduct } from "../../../../src/lib/storefront/release-artifact";
import manifest from "../asset-manifest.generated.json";
import { renderNoticePage, type NoticeKind } from "../notice-page";
import { servePublicStorePage, type PageDeps } from "../page-route";
import { storeAssets } from "../serve-page";
import { renderStorePage } from "../shop";
import { productHref } from "../shop/ui";
import { SAMPLE_PRODUCTS, publishTestStore } from "../test-support";

const [outDir = "", root = ""] = process.argv.slice(2);
if (!outDir || !root) throw new Error("usage: node render-fixtures.mjs OUTDIR REPO_ROOT");
const LOCALES = ["ar", "fr", "en"] as const;
const SLUG = "sahel-store";

const MISSING_PHOTO: StorefrontReleaseProduct = {
  id: "product_00000004",
  name: "Lampe en laiton",
  sku: "LAM-4",
  images: JSON.stringify(["https://images.example.test/missing.jpg"]),
  price: 3_900,
  stock: 5,
  productVariants: [],
};
const PRODUCTS: readonly StorefrontReleaseProduct[] = [...SAMPLE_PRODUCTS, MISSING_PHOTO];
const PAGES = ["home", "product1", "product2", "product3", "product4"] as const;

const deps: PageDeps = {
  render: renderStorePage,
  // The same function the Worker calls, so the fixtures carry what production carries (the hand-written list here once lacked `photos`).
  assets: storeAssets(),
  cache: null,
};

const svg = (label: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000" viewBox="0 0 800 1000"><rect width="800" height="1000" fill="#d9d2c4"/><text x="400" y="500" font-size="48" text-anchor="middle" fill="#6b6455">${label}</text></svg>`;

mkdirSync(join(outDir, "fixture"), { recursive: true });
cpSync(join(root, "control-plane/storefront/public"), outDir, { recursive: true });
if (!existsSync(join(outDir, manifest.css))) console.warn(`WARNING: ${manifest.css} is not in public/: build the public assets first`);
for (const name of ["miroir-1", "miroir-2"]) writeFileSync(join(outDir, "fixture", `${name}.svg`), svg(name));

const localPhotos = (html: string): string => html.replace(/https:\/\/images\.example\.test\/([\w-]+)\.jpg/g, "/fixture/$1.svg");

type Row = { file: string; style: string; locale: string; page: string; status: number };
const rows: Row[] = [];
const save = (file: string, html: string, style: string, locale: string, page: string, status: number): void => {
  writeFileSync(join(outDir, file), localPhotos(html));
  rows.push({ file, style, locale, page, status });
};

for (const style of STOREFRONT_TEMPLATE_IDS) {
  for (const locale of LOCALES) {
    const store = await publishTestStore({ slug: SLUG, locale, template: style, products: PRODUCTS });
    for (const page of PAGES) {
      const productId = page === "home" ? null : (PRODUCTS[Number(page.slice(-1)) - 1]?.id ?? null);
      const path = productId ? productHref(SLUG, productId) : `/${SLUG}`;
      const response = await servePublicStorePage(new Request(`https://shop.test${path}?lang=${locale}`), store.env, SLUG, undefined, deps, productId);
      save(`${style}.${locale}.${page}.html`, await response.text(), style, locale, page, response.status);
    }
    store.database.close();
  }
}
for (const locale of LOCALES) {
  for (const kind of ["notFound", "paused", "error"] satisfies NoticeKind[]) {
    save(`notice.${locale}.${kind}.html`, renderNoticePage({ locale, kind, cssPath: manifest.css }), "notice", locale, kind, 0);
  }
}
writeFileSync(join(outDir, "index.json"), JSON.stringify(rows, null, 1));
console.log(`rendered ${rows.length} pages into ${outDir}; non-200: ${rows.filter((row) => row.status !== 200 && row.status !== 0).map((row) => `${row.file}=${row.status}`).join(" ") || "none"}`);
