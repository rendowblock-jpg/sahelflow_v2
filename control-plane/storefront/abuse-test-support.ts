import type { DatabaseSync } from "node:sqlite";

import { createDefaultStorefrontTheme } from "../../src/lib/storefront/theme-default";
import { createStorefrontReleaseInput } from "../../src/lib/storefront/release-artifact";
import { publishRelease } from "./publish-release";
import { storefrontReceiptAadValue } from "./receipt-protocol";
import { sha256Hex } from "./shared";
import { environment, openDatabase } from "./test-d1";
import type { StorefrontWorkerEnvironment } from "./types";

export const WORKSPACE = "0123456789abcdef0123456789abcdef";
export const STOREFRONT = "storefront_12345678";
export const SHOP = "shop_12345678";
export const RELEASE = "release_12345678";
export const SLUG = "sahel-store";
export const ITEM = "product_12345678:base";
export const NOW = Date.UTC(2026, 9, 31, 12, 0, 0);

export async function seedShop(stock = 10): Promise<{ database: DatabaseSync; env: StorefrontWorkerEnvironment }> {
  const database = openDatabase();
  database.exec(`INSERT INTO storefront (storefront_id, workspace_id, shop_id, slug, receipt_encryption_public_key, state)
    VALUES ('${STOREFRONT}', '${WORKSPACE}', '${SHOP}', '${SLUG}', 'desktop-key', 'active')`);
  const theme = createDefaultStorefrontTheme("sahara");
  theme.builder.shippingRules = [{ wilayaCode: "16", deliveryMode: "home", feeDzd: 500 }];
  const body = createStorefrontReleaseInput({
    workspaceId: WORKSPACE, releaseId: RELEASE, parentReleaseId: null, locale: "ar",
    draft: { name: "Sahel store", slug: SLUG, description: "", theme, selectedProductIds: ["product_12345678"], isActive: true },
    products: [{ id: "product_12345678", name: "Product", sku: "SKU-1", images: null, price: 2500, stock, productVariants: [] }],
  });
  const env: StorefrontWorkerEnvironment = {
    ...environment(database),
    CONTROL: { fetch: async () => Response.json({ workspaceId: WORKSPACE, shopSlots: 1, storefrontActive: true }) },
  };
  const published = await publishRelease(new Request("https://store.test/publish", {
    method: "POST", headers: { Authorization: "Bearer desktop", "Content-Type": "application/json" }, body: JSON.stringify(body),
  }), env, STOREFRONT);
  if (published.status !== 201) throw new Error(`seed publish failed: ${published.status}`);
  return { database, env };
}

export async function honestBody(key: string, extra: Record<string, unknown> = {}, quantity = 1): Promise<Record<string, unknown>> {
  const aadDigest = await sha256Hex(storefrontReceiptAadValue({
    storefrontId: STOREFRONT, releaseId: RELEASE, idempotencyKey: key, wilayaCode: "16", deliveryMode: "home",
  }));
  const sealed = btoa(JSON.stringify({ v: 1, iv: btoa("0123456789ab"), ciphertext: btoa("x".repeat(20)), aadDigest }));
  return {
    idempotencyKey: key, encryptedCustomer: sealed, wrappedCustomerKey: btoa("k".repeat(24)),
    wilayaCode: "16", deliveryMode: "home", items: [{ itemKey: ITEM, quantity }], ...extra,
  };
}

export function checkoutRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`https://store.test/v1/storefront/${SLUG}/checkout`, {
    method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body),
  });
}

export const receiptCount = (database: DatabaseSync, where = "1=1"): number =>
  Number(database.prepare(`SELECT COUNT(*) AS n FROM storefront_receipt WHERE ${where}`).get()?.n);

export const remaining = (database: DatabaseSync): number =>
  Number(database.prepare("SELECT remaining_quantity AS q FROM storefront_allocation WHERE release_id = ?1 AND item_key = ?2").get(RELEASE, ITEM)?.q);

/** `count` open receipts without lines (they pin no stock), each `ageMinutes` old. */
export function insertOpenReceipts(database: DatabaseSync, count: number, ageMinutes = 0, prefix = "seed"): void {
  const insert = database.prepare(`INSERT INTO storefront_receipt
    (receipt_id, storefront_id, release_id, idempotency_key, request_digest, encrypted_customer, wrapped_customer_key,
     wilaya_code, delivery_mode, subtotal_dzd, shipping_dzd, total_dzd, state, created_at)
    VALUES (?1, ?2, ?3, ?4, ?5, 'AAAA', 'AAAA', '16', 'home', 0, 0, 0, 'received', datetime('now', ?6))`);
  for (let index = 0; index < count; index += 1) {
    const id = `${prefix}_${String(index).padStart(6, "0")}`;
    insert.run(`rcpt_${id}`, STOREFRONT, RELEASE, `idem_${id}`, "a".repeat(64), `-${ageMinutes} minutes`);
  }
}
