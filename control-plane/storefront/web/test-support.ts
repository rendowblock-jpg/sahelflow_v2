/**
 * Test-only: publishes a store the way the desktop does (the real release
 * input builder and the real publishRelease), so page tests read the exact rows
 * production would hold.
 */
import type { DatabaseSync } from "node:sqlite";

import type { StorefrontReleaseProduct } from "../../../src/lib/storefront/release-artifact";
import { createStorefrontReleaseInput } from "../../../src/lib/storefront/release-artifact";
import type { StorefrontTheme } from "../../../src/lib/storefront/presentation-types";
import { createDefaultStorefrontTheme } from "../../../src/lib/storefront/theme-default";
import { publishRelease } from "../publish-release";
import { TEST_WORKSPACE_ID, environment, openDatabase } from "../test-d1";
import type { PublicArtifact } from "../shared";
import type { StorefrontWorkerEnvironment } from "../types";
import type { RenderStorePageInput } from "./types";

export const TEST_STOREFRONT_ID = "storefront_12345678";
export const TEST_SHOP_ID = "shop_12345678";
export const TEST_RELEASE_ID = "release_12345678";

export const SAMPLE_PRODUCTS: readonly StorefrontReleaseProduct[] = [
  {
    id: "product_00000001",
    name: "Miroir Mural Décoratif",
    sku: "MIR-01",
    images: JSON.stringify(["https://images.example.test/miroir-1.jpg", "https://images.example.test/miroir-2.jpg"]),
    price: 2_500,
    stock: 10,
    productVariants: [],
  },
  {
    id: "product_00000002",
    name: "ساعة حائط",
    sku: null,
    images: null,
    price: 4_200,
    stock: 0,
    productVariants: [],
  },
  {
    id: "product_00000003",
    name: "Tapis berbère",
    sku: "TAP-3",
    images: null,
    price: 9_000,
    stock: 3,
    productVariants: [
      { id: "variant_small", name: "Petit", price: 8_000, stock: 2, isActive: true },
      { id: "variant_large", name: "Grand", price: 9_500, stock: 1, isActive: true },
      { id: "variant_retired", name: "Ancien", price: 1, stock: 99, isActive: false },
    ],
  },
];

export type PublishedTestStore = {
  database: DatabaseSync;
  env: StorefrontWorkerEnvironment;
  slug: string;
  theme: StorefrontTheme;
};

export async function publishTestStore(
  options: {
    slug?: string;
    storeName?: string;
    description?: string;
    locale?: "ar" | "fr" | "en";
    template?: import("../../../src/lib/storefront/presentation-types").StorefrontTemplateId;
    products?: readonly StorefrontReleaseProduct[];
    shapeTheme?: (theme: StorefrontTheme) => void;
    paused?: boolean;
    /** Only to hold several stores in one database; the defaults suit single-store tests. */
    ids?: { storefrontId: string; shopId: string; releaseId: string };
  } = {},
): Promise<PublishedTestStore> {
  const slug = options.slug ?? "sahel-store";
  const products = options.products ?? SAMPLE_PRODUCTS;
  const ids = options.ids ?? { storefrontId: TEST_STOREFRONT_ID, shopId: TEST_SHOP_ID, releaseId: TEST_RELEASE_ID };
  const database = openDatabase();
  database.exec(`
    INSERT INTO storefront (
      storefront_id, workspace_id, shop_id, slug, receipt_encryption_public_key, state
    ) VALUES (
      '${ids.storefrontId}', '${TEST_WORKSPACE_ID}', '${ids.shopId}', '${slug}', 'desktop-key', 'active'
    );
  `);
  const env = environment(database);
  const theme = createDefaultStorefrontTheme(options.template ?? "sahara");
  theme.builder.shippingRules = [{ wilayaCode: "16", deliveryMode: "home", feeDzd: 500 }];
  options.shapeTheme?.(theme);
  const body = createStorefrontReleaseInput({
    workspaceId: TEST_WORKSPACE_ID,
    releaseId: ids.releaseId,
    parentReleaseId: null,
    locale: options.locale ?? "ar",
    draft: {
      name: options.storeName ?? "متجر الساحل",
      slug,
      description: options.description ?? "",
      theme,
      selectedProductIds: products.map((product) => product.id),
      isActive: true,
    },
    products,
  });
  const response = await publishRelease(
    new Request("https://storefront.test/publish", {
      method: "POST",
      headers: { Authorization: "Bearer desktop", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    env,
    ids.storefrontId,
  );
  if (response.status !== 201) throw new Error(`test publish failed: ${response.status} ${await response.text()}`);
  if (options.paused) {
    database.prepare("UPDATE storefront SET state = 'paused' WHERE storefront_id = ?1").run(ids.storefrontId);
  }
  return { database, env, slug, theme };
}

/** The exact input the page route would hand to the renderer for a store published by publishTestStore. */
export function renderInputFor(store: PublishedTestStore, overrides: Partial<RenderStorePageInput> = {}): RenderStorePageInput {
  const release = store.database
    .prepare("SELECT release_id, locale, artifact_json FROM storefront_release")
    .get() as { release_id: string; locale: "ar" | "fr" | "en"; artifact_json: string };
  const stock = new Map(
    (store.database.prepare("SELECT item_key, unit_price_dzd, remaining_quantity FROM storefront_allocation").all() as Array<{ item_key: string; unit_price_dzd: number; remaining_quantity: number }>)
      .map((row) => [row.item_key, { unitPriceDzd: row.unit_price_dzd, remaining: row.remaining_quantity }]),
  );
  const shipping = (store.database.prepare("SELECT wilaya_code, delivery_mode, fee_dzd FROM storefront_shipping_rule").all() as Array<{ wilaya_code: string; delivery_mode: "home" | "desk"; fee_dzd: number }>)
    .map((row) => ({ wilayaCode: row.wilaya_code, mode: row.delivery_mode, feeDzd: row.fee_dzd }));
  const key = store.database.prepare("SELECT receipt_encryption_public_key AS k, storefront_id AS id FROM storefront").get() as { k: string; id: string };
  return {
    origin: "https://shop.test",
    slug: store.slug,
    locale: release.locale,
    defaultLocale: release.locale,
    artifact: JSON.parse(release.artifact_json) as PublicArtifact,
    stock,
    assets: { css: "/_sf/shop.test.css", js: "/_sf/shop.test.js", communes: "/_sf/c.test", skins: { prime: { css: "/_sf/prime.test.css" }, souk: { css: "/_sf/souk.test.css" }, reel: { css: "/_sf/reel.test.css", js: "/_sf/reel.test.js" } }, fonts: Object.fromEntries(["naskh-bold", "kufi-bold", "kufi-regular", "jost-var-latin", "alexandria-300-arabic", "readexpro-var-arabic", "readexpro-var-latin", "archivo-cond-800-latin"].map((name) => [name, `/_sf/f.test.${name}.woff2`])) },
    storefrontId: key.id,
    releaseId: release.release_id,
    receiptKey: key.k,
    shipping,
    productId: null,
    ...overrides,
  };
}
