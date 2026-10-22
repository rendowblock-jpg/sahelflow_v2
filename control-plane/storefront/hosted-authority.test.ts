import { describe, expect, it } from "vitest";
import type { DatabaseSync } from "node:sqlite";

import { createDefaultStorefrontTheme } from "../../src/lib/storefront/theme-default";
import { createStorefrontReleaseInput } from "../../src/lib/storefront/release-artifact";
import { completeReceipt } from "./receipts";
import { publishRelease } from "./publish-release";
import { pauseStorefront } from "./pause-storefront";
import { environment, openDatabase } from "./test-d1";
import type { StorefrontWorkerEnvironment } from "./types";

const WORKSPACE = "0123456789abcdef0123456789abcdef";
const STOREFRONT = "storefront_12345678";
const SHOP = "shop_12345678";
const RELEASE = "release_12345678";

function desktopPost(body: unknown): Request {
  return new Request("https://storefront.test/publish", {
    method: "POST",
    headers: { Authorization: "Bearer desktop", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function releaseBody(price: number, quantity: number, fee: number): Record<string, unknown> {
  const theme = createDefaultStorefrontTheme("sahara");
  theme.builder.shippingRules = [{ wilayaCode: "16", deliveryMode: "home", feeDzd: fee }];
  return createStorefrontReleaseInput({
    workspaceId: WORKSPACE,
    releaseId: RELEASE,
    parentReleaseId: null,
    locale: "ar",
    draft: {
      name: "Sahel store",
      slug: "sahel-store",
      description: "",
      theme,
      selectedProductIds: ["product_12345678"],
      isActive: true,
    },
    products: [{
      id: "product_12345678",
      name: "Product",
      sku: "SKU-1",
      images: null,
      price,
      stock: quantity,
      productVariants: [],
    }],
  });
}

describe("hosted storefront allocation authority", () => {
  it("restores rejected receipt quantity once", async () => {
    const database = openDatabase();
    database.exec(`
      INSERT INTO storefront (
        storefront_id, workspace_id, shop_id, slug, receipt_encryption_public_key, state
      ) VALUES (
        '${STOREFRONT}', '${WORKSPACE}', '${SHOP}', 'sahel-store', 'desktop-key', 'active'
      );
      INSERT INTO storefront_release (
        release_id, storefront_id, parent_release_id, template_id, locale, artifact_json, artifact_digest
      ) VALUES (
        '${RELEASE}', '${STOREFRONT}', NULL, 'sahara', 'ar', '{}', '${"a".repeat(64)}'
      );
      INSERT INTO storefront_allocation (
        release_id, item_key, unit_price_dzd, delegated_quantity, remaining_quantity
      ) VALUES ('${RELEASE}', 'product_12345678:base', 2500, 10, 10);
      INSERT INTO storefront_receipt (
        receipt_id, storefront_id, release_id, idempotency_key, request_digest,
        encrypted_customer, wrapped_customer_key, wilaya_code, delivery_mode,
        subtotal_dzd, shipping_dzd, total_dzd, state
      ) VALUES (
        'receipt_12345678', '${STOREFRONT}', '${RELEASE}', 'checkout_12345678', '${"b".repeat(64)}',
        'cipher', 'wrapped', '16', 'home', 5000, 500, 5500, 'received'
      );
      INSERT INTO storefront_receipt_line (
        receipt_id, release_id, item_key, quantity, unit_price_dzd
      ) VALUES ('receipt_12345678', '${RELEASE}', 'product_12345678:base', 2, 2500);
    `);
    const remaining = () =>
      Number(database.prepare(
        "SELECT remaining_quantity AS qty FROM storefront_allocation WHERE item_key = 'product_12345678:base'",
      ).get()?.qty);
    expect(remaining()).toBe(8);

    const env = environment(database);
    const digest = "c".repeat(64);
    const body = { workspaceId: WORKSPACE, shopId: SHOP, state: "rejected", resultDigest: digest };
    const first = await completeReceipt(desktopPost(body), env, "receipt_12345678");
    expect(first.status).toBe(200);
    await expect(first.json()).resolves.toMatchObject({ status: "rejected" });
    expect(remaining()).toBe(10);

    const replay = await completeReceipt(desktopPost(body), env, "receipt_12345678");
    expect(replay.status).toBe(200);
    expect(remaining()).toBe(10);

    database.prepare(
      "UPDATE storefront_receipt SET state = 'rejected' WHERE receipt_id = 'receipt_12345678'",
    ).run();
    expect(remaining()).toBe(10);
    database.close();
  });

  it("does not treat a price change as a published replay", async () => {
    const database = openDatabase();
    database.exec(`
      INSERT INTO storefront (
        storefront_id, workspace_id, shop_id, slug, receipt_encryption_public_key, state
      ) VALUES (
        '${STOREFRONT}', '${WORKSPACE}', '${SHOP}', 'sahel-store', 'desktop-key', 'active'
      );
    `);
    const env = environment(database);
    const original = releaseBody(2500, 10, 500);
    const created = await publishRelease(desktopPost(original), env, STOREFRONT);
    expect(created.status).toBe(201);
    await expect(created.json()).resolves.toMatchObject({ status: "published", replay: false });

    const repriced = releaseBody(2600, 10, 500);
    const changed = await publishRelease(desktopPost(repriced), env, STOREFRONT);
    expect(changed.status).toBe(409);
    await expect(changed.json()).resolves.toMatchObject({ error: "release_idempotency_conflict" });
    expect(changed.status).not.toBe(200);
    const price = database.prepare(
      "SELECT unit_price_dzd AS price, remaining_quantity AS qty FROM storefront_allocation",
    ).get() as { price: number; qty: number };
    expect(price).toMatchObject({ price: 2500, qty: 10 });

    const replay = await publishRelease(desktopPost(original), env, STOREFRONT);
    expect(replay.status).toBe(200);
    await expect(replay.json()).resolves.toMatchObject({ status: "published", replay: true });
    const afterReplay = database.prepare(
      "SELECT unit_price_dzd AS price, remaining_quantity AS qty FROM storefront_allocation",
    ).get() as { price: number; qty: number };
    expect(afterReplay).toMatchObject({ price: 2500, qty: 10 });
    database.close();
  });
});

describe("hosted storefront allocation after a pause, a restock or a racing sale", () => {
  const ITEM = "product_12345678:base";

  function seed(): { database: DatabaseSync; env: StorefrontWorkerEnvironment } {
    const database = openDatabase();
    database.exec(`
      INSERT INTO storefront (
        storefront_id, workspace_id, shop_id, slug, receipt_encryption_public_key, state
      ) VALUES (
        '${STOREFRONT}', '${WORKSPACE}', '${SHOP}', 'sahel-store', 'desktop-key', 'active'
      );
    `);
    return { database, env: environment(database) };
  }

  /** The request the desktop builds: `quantity` in total, `fresh` of it newly freed. */
  function release(releaseId: string, parent: string | null, quantity: number, fresh?: number): Record<string, unknown> {
    const theme = createDefaultStorefrontTheme("sahara");
    theme.builder.shippingRules = [{ wilayaCode: "16", deliveryMode: "home", feeDzd: 500 }];
    return createStorefrontReleaseInput({
      workspaceId: WORKSPACE,
      releaseId,
      parentReleaseId: parent,
      locale: "ar",
      draft: {
        name: "Sahel store",
        slug: "sahel-store",
        description: "",
        theme,
        selectedProductIds: ["product_12345678"],
        isActive: true,
      },
      products: [{
        id: "product_12345678", name: "Product", sku: "SKU-1", images: null,
        price: 2500, stock: quantity, productVariants: [],
      }],
      ...(fresh === undefined ? {} : { freshByItemKey: new Map([[ITEM, fresh]]) }),
    });
  }

  const remaining = (database: DatabaseSync, releaseId: string): number =>
    Number(database.prepare(
      "SELECT remaining_quantity AS qty FROM storefront_allocation WHERE release_id = ?1 AND item_key = ?2",
    ).get(releaseId, ITEM)?.qty);
  const delegated = (database: DatabaseSync, releaseId: string): number =>
    Number(database.prepare(
      "SELECT delegated_quantity AS qty FROM storefront_allocation WHERE release_id = ?1 AND item_key = ?2",
    ).get(releaseId, ITEM)?.qty);
  /** A customer order accepted by the hosted checkout: the unsold quantity falls. */
  const sell = (database: DatabaseSync, releaseId: string, quantity: number): void => {
    database.prepare(
      "UPDATE storefront_allocation SET remaining_quantity = remaining_quantity - ?3 WHERE release_id = ?1 AND item_key = ?2",
    ).run(releaseId, ITEM, quantity);
  };
  const pause = (env: StorefrontWorkerEnvironment, operationId: string) =>
    pauseStorefront(desktopPost({ workspaceId: WORKSPACE, operationId }), env, STOREFRONT);

  it("offers the shop's stock again after a pause (the paused release has nothing left)", async () => {
    const { database, env } = seed();
    expect((await publishRelease(desktopPost(release("release_aaaaaaaa", null, 5)), env, STOREFRONT)).status).toBe(201);
    expect(remaining(database, "release_aaaaaaaa")).toBe(5);

    const paused = await pause(env, "pause_operation_1");
    expect(paused.status).toBe(200);
    await expect(paused.json()).resolves.toMatchObject({ status: "paused", retiredAllocations: [{ itemKey: ITEM, quantity: 5 }] });
    expect(remaining(database, "release_aaaaaaaa")).toBe(0);

    // The desktop got the 5 back from the pause, holds them provisionally and declares them fresh.
    const resumed = await publishRelease(desktopPost(release("release_bbbbbbbb", "release_aaaaaaaa", 5, 5)), env, STOREFRONT);
    expect(resumed.status).toBe(201);
    await expect(resumed.json()).resolves.toMatchObject({ allocations: [{ itemKey: ITEM, quantity: 5 }], retiredAllocations: [] });
    expect(delegated(database, "release_bbbbbbbb")).toBe(5);
    expect(remaining(database, "release_bbbbbbbb")).toBe(5);
    expect(database.prepare("SELECT state FROM storefront").get()).toMatchObject({ state: "active" });
    database.close();
  });

  it("never creates stock the desktop did not declare: the same resume without freshQuantity delegates nothing", async () => {
    const { database, env } = seed();
    await publishRelease(desktopPost(release("release_aaaaaaaa", null, 5)), env, STOREFRONT);
    await pause(env, "pause_operation_1");
    const undeclared = await publishRelease(desktopPost(release("release_bbbbbbbb", "release_aaaaaaaa", 5)), env, STOREFRONT);
    expect(undeclared.status).toBe(201);
    expect(delegated(database, "release_bbbbbbbb")).toBe(0);
    database.close();
  });

  it("offers an item again after it sold out and was restocked", async () => {
    const { database, env } = seed();
    await publishRelease(desktopPost(release("release_aaaaaaaa", null, 3)), env, STOREFRONT);
    sell(database, "release_aaaaaaaa", 3);
    expect(remaining(database, "release_aaaaaaaa")).toBe(0);
    const restocked = await publishRelease(desktopPost(release("release_bbbbbbbb", "release_aaaaaaaa", 5, 5)), env, STOREFRONT);
    expect(restocked.status).toBe(201);
    expect(delegated(database, "release_bbbbbbbb")).toBe(5);
    database.close();
  });

  it("keeps an ordinary republish conservative: what is left stays, a restock adds on top", async () => {
    const { database, env } = seed();
    await publishRelease(desktopPost(release("release_aaaaaaaa", null, 10)), env, STOREFRONT);
    sell(database, "release_aaaaaaaa", 4);
    // 6 unsold are carried over; 2 more units were restocked and are declared fresh.
    const republished = await publishRelease(desktopPost(release("release_bbbbbbbb", "release_aaaaaaaa", 8, 2)), env, STOREFRONT);
    expect(republished.status).toBe(201);
    await expect(republished.json()).resolves.toMatchObject({ retiredAllocations: [{ itemKey: ITEM, quantity: 6 }] });
    expect(delegated(database, "release_bbbbbbbb")).toBe(8);
    expect(remaining(database, "release_aaaaaaaa")).toBe(0);
    database.close();
  });

  it("a sale that races the republish is not delegated a second time", async () => {
    const { database, env } = seed();
    await publishRelease(desktopPost(release("release_aaaaaaaa", null, 5)), env, STOREFRONT);
    // The desktop read 5 unsold, restocked 2 and asks for 7 (2 fresh). Before the publish
    // lands a customer buys 3, so only 2 of the old release's stock are really left.
    sell(database, "release_aaaaaaaa", 3);
    const raced = await publishRelease(desktopPost(release("release_bbbbbbbb", "release_aaaaaaaa", 7, 2)), env, STOREFRONT);
    expect(raced.status).toBe(201);
    expect(delegated(database, "release_bbbbbbbb")).toBe(4);
    // 7 requested - 3 bought in the meantime: exactly what the shop still has.
    expect(remaining(database, "release_bbbbbbbb")).toBe(4);
    database.close();
  });

  it("a request without freshQuantity behaves exactly as before: capped at the parent's leftovers", async () => {
    const { database, env } = seed();
    await publishRelease(desktopPost(release("release_aaaaaaaa", null, 5)), env, STOREFRONT);
    sell(database, "release_aaaaaaaa", 1);
    const capped = await publishRelease(desktopPost(release("release_bbbbbbbb", "release_aaaaaaaa", 9)), env, STOREFRONT);
    expect(capped.status).toBe(201);
    expect(delegated(database, "release_bbbbbbbb")).toBe(4);
    database.close();
  });

  it("never delegates more than the desktop asked for, even when the parent has more left", async () => {
    const { database, env } = seed();
    await publishRelease(desktopPost(release("release_aaaaaaaa", null, 5)), env, STOREFRONT);
    // The seller lowered what the shop offers: 3 in total, 1 of them fresh, while the parent still has 5.
    const lowered = await publishRelease(desktopPost(release("release_bbbbbbbb", "release_aaaaaaaa", 3, 1)), env, STOREFRONT);
    expect(lowered.status).toBe(201);
    expect(delegated(database, "release_bbbbbbbb")).toBe(3);
    // and the parent's other 5 are retired in full, never left selling beside the new release
    await expect(lowered.json()).resolves.toMatchObject({ retiredAllocations: [{ itemKey: ITEM, quantity: 5 }] });
    expect(remaining(database, "release_aaaaaaaa")).toBe(0);
    database.close();
  });

  it("ignores freshQuantity on a first release, which has no parent", async () => {
    const { database, env } = seed();
    const first = await publishRelease(desktopPost(release("release_aaaaaaaa", null, 4, 4)), env, STOREFRONT);
    expect(first.status).toBe(201);
    expect(delegated(database, "release_aaaaaaaa")).toBe(4);
    database.close();
  });

  it("refuses a freshQuantity that is more than the quantity, negative, fractional or not a number", async () => {
    const { database, env } = seed();
    await publishRelease(desktopPost(release("release_aaaaaaaa", null, 5)), env, STOREFRONT);
    for (const bad of [6, -1, 1.5, "2", null, Number.NaN]) {
      const body = release("release_bbbbbbbb", "release_aaaaaaaa", 5);
      (body.allocations as Array<Record<string, unknown>>)[0]!.freshQuantity = bad;
      const refused = await publishRelease(desktopPost(body), env, STOREFRONT);
      expect(refused.status, JSON.stringify(bad)).toBe(400);
    }
    expect(database.prepare("SELECT COUNT(*) AS n FROM storefront_release").get()).toMatchObject({ n: 1 });
    database.close();
  });

  it("treats the same request, resent, as a replay and a changed fresh part as a different sale", async () => {
    const { database, env } = seed();
    await publishRelease(desktopPost(release("release_aaaaaaaa", null, 5)), env, STOREFRONT);
    await pause(env, "pause_operation_1");
    const body = release("release_bbbbbbbb", "release_aaaaaaaa", 5, 5);
    expect((await publishRelease(desktopPost(body), env, STOREFRONT)).status).toBe(201);
    const replay = await publishRelease(desktopPost(body), env, STOREFRONT);
    expect(replay.status).toBe(200);
    await expect(replay.json()).resolves.toMatchObject({ replay: true });
    const different = await publishRelease(desktopPost(release("release_bbbbbbbb", "release_aaaaaaaa", 5, 4)), env, STOREFRONT);
    expect(different.status).toBe(409);
    await expect(different.json()).resolves.toMatchObject({ error: "release_idempotency_conflict" });
    expect(delegated(database, "release_bbbbbbbb")).toBe(5);
    database.close();
  });
});
