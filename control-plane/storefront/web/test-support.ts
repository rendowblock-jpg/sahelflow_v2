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
import type { StorefrontWorkerEnvironment } from "../types";

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
    template?: "sahara" | "atlas" | "oasis";
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
