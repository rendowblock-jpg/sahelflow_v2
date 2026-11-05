import { describe, expect, it } from "vitest";
import type { DatabaseSync } from "node:sqlite";

import { createStorefrontReleaseInput } from "../../src/lib/storefront/release-artifact";
import { createDefaultStorefrontTheme } from "../../src/lib/storefront/theme-default";
import { pauseStorefront } from "./pause-storefront";
import { publishRelease } from "./publish-release";
import { parseReleaseInput } from "./release-input";
import { rollbackRelease } from "./rollback-release";
import { environment, openDatabase } from "./test-d1";
import type { StorefrontWorkerEnvironment } from "./types";

const WORKSPACE = "0123456789abcdef0123456789abcdef";
const STOREFRONT = "storefront_12345678";
const ITEM = "product_12345678:base";
const R1 = "release_11111111";
const R2 = "release_22222222";
const R3 = "release_33333333";
const PRICE = 3000;
const TWO = [{ q: 2, t: 5500 }, { q: 3, t: 7500 }];
const OTHER = [{ q: 2, t: 5000 }];
const TWO_JSON = '[{"q":2,"t":5500},{"q":3,"t":7500}]';

function post(body: unknown): Request {
  return new Request("https://storefront.test/x", {
    method: "POST",
    headers: { Authorization: "Bearer desktop", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** The request the desktop builds today, plus an optional ladder on the one allocation. */
function release(releaseId: string, parent: string | null, offers?: unknown): Record<string, unknown> {
  const theme = createDefaultStorefrontTheme("sahara");
  theme.builder.shippingRules = [{ wilayaCode: "16", deliveryMode: "home", feeDzd: 500 }];
  const body = createStorefrontReleaseInput({
    workspaceId: WORKSPACE,
    releaseId,
    parentReleaseId: parent,
    locale: "ar",
    draft: { name: "Sahel store", slug: "sahel-store", description: "", theme, selectedProductIds: ["product_12345678"], isActive: true },
    products: [{ id: "product_12345678", name: "Product", sku: "SKU-1", images: null, price: PRICE, stock: 20, productVariants: [] }],
  });
  if (offers !== undefined) firstAllocation(body).offers = offers;
  return body;
}

function firstAllocation(body: Record<string, unknown>): Record<string, unknown> {
  const first = (body.allocations as Array<Record<string, unknown>>)[0];
  if (!first) throw new Error("test body has no allocation");
  return first;
}

function store(): { database: DatabaseSync; env: StorefrontWorkerEnvironment } {
  const database = openDatabase();
  database.exec(`INSERT INTO storefront (storefront_id, workspace_id, shop_id, slug, receipt_encryption_public_key, state)
    VALUES ('${STOREFRONT}', '${WORKSPACE}', 'shop_12345678', 'sahel-store', 'desktop-key', 'active')`);
  return { database, env: environment(database) };
}

const offersOf = (database: DatabaseSync, releaseId: string) =>
  database.prepare("SELECT offers_json AS o FROM storefront_allocation WHERE release_id = ?1 AND item_key = ?2").get(releaseId, ITEM)?.o;
const publish = (env: StorefrontWorkerEnvironment, body: unknown) => publishRelease(post(body), env, STOREFRONT);

describe("parseReleaseInput: allocations may carry an `offers` ladder", () => {
  it("without offers the parsed allocation is exactly what it was (no offers key)", () => {
    const parsed = parseReleaseInput(release(R1, null));
    expect(parsed).not.toBeNull();
    expect(parsed?.allocations).toHaveLength(1);
    expect(Object.keys(parsed?.allocations[0] ?? {}).sort()).toEqual(["itemKey", "quantity", "unitPriceDzd"]);
  });

  it("an empty ladder is the same as none", () => {
    expect(Object.keys(parseReleaseInput(release(R1, null, []))?.allocations[0] ?? {})).not.toContain("offers");
  });

  it("keeps a valid ladder, normalised", () => {
    const parsed = parseReleaseInput(release(R1, null, [{ t: 5500, q: 2 }, { t: 7500, q: 3 }]));
    expect(parsed?.allocations[0]?.offers).toEqual(TWO);
    expect(JSON.stringify(parsed?.allocations[0]?.offers)).toBe(TWO_JSON);
  });

  it.each([
    ["unsorted", [{ q: 3, t: 7500 }, { q: 2, t: 5500 }]],
    ["a bundle not cheaper than buying singly", [{ q: 2, t: 6000 }]],
    ["six tiers", [2, 3, 4, 5, 6, 7].map((q) => ({ q, t: q * 2900 }))],
    ["a float", [{ q: 2, t: 5500.5 }]],
    ["an extra key", [{ q: 2, t: 5500, note: "x" }]],
    ["a string total", [{ q: 2, t: "5500" }]],
    ["null instead of an array", null],
  ])("a bad ladder (%s) makes the whole input invalid", (_name, offers) => {
    expect(parseReleaseInput(release(R1, null, offers))).toBeNull();
  });

  it("the ladder is checked against the allocation's own unit price", () => {
    const body = release(R1, null, TWO);
    firstAllocation(body).unitPriceDzd = 2000;
    expect(parseReleaseInput(body)).toBeNull();
  });
});

describe("every writer of storefront_allocation keeps offers_json", () => {
  it("publish writes the canonical ladder; a release without offers writes NULL", async () => {
    const { database, env } = store();
    expect((await publish(env, release(R1, null, [{ t: 5500, q: 2 }, { t: 7500, q: 3 }]))).status).toBe(201);
    expect(offersOf(database, R1)).toBe(TWO_JSON);
    const other = store();
    expect((await publish(other.env, release(R1, null))).status).toBe(201);
    expect(offersOf(other.database, R1)).toBeNull();
  });

  it("publish refuses a bad ladder and creates nothing", async () => {
    const { database, env } = store();
    const response = await publish(env, release(R1, null, [{ q: 2, t: 6000 }]));
    expect(response.status).toBe(400);
    expect(database.prepare("SELECT count(*) AS n FROM storefront_release").get()).toEqual({ n: 0 });
  });

  it("republish (copy to a child release): the child takes the request's ladder, the parent's row is left alone", async () => {
    const { database, env } = store();
    await publish(env, release(R1, null, TWO));
    expect((await publish(env, release(R2, R1, OTHER))).status).toBe(201);
    expect(offersOf(database, R2)).toBe('[{"q":2,"t":5000}]');
    expect(offersOf(database, R1)).toBe(TWO_JSON);
  });

  it("republish without offers removes them from the new release only (the request is the authority, like the price)", async () => {
    const { database, env } = store();
    await publish(env, release(R1, null, TWO));
    expect((await publish(env, release(R2, R1))).status).toBe(201);
    expect(offersOf(database, R2)).toBeNull();
    expect(offersOf(database, R1)).toBe(TWO_JSON);
  });

  it("pause zeroes the stock of the active release and keeps its ladder", async () => {
    const { database, env } = store();
    await publish(env, release(R1, null, TWO));
    const paused = await pauseStorefront(post({ workspaceId: WORKSPACE, operationId: "pause_operation_1" }), env, STOREFRONT);
    expect(paused.status).toBe(200);
    expect(database.prepare("SELECT remaining_quantity AS r FROM storefront_allocation WHERE release_id = ?1").get(R1)).toEqual({ r: 0 });
    expect(offersOf(database, R1)).toBe(TWO_JSON);
  });

  it("rollback restores a retired allocation WITH the ladder of the release it goes back to", async () => {
    const { database, env } = store();
    await publish(env, release(R1, null, TWO));
    await publish(env, release(R2, R1)); // the current release has no offers
    const response = await rollbackRelease(post({
      workspaceId: WORKSPACE, sourceReleaseId: R1, releaseId: R3, expectedActiveReleaseId: R2,
      allocations: [{ itemKey: ITEM, unitPriceDzd: PRICE, quantity: 5 }],
    }), env, STOREFRONT);
    expect(response.status).toBeLessThan(300);
    expect(offersOf(database, R3)).toBe(TWO_JSON);
  });

  it("rollback to a release that had no offers gives NULL, not the ladder of the release being replaced", async () => {
    const { database, env } = store();
    await publish(env, release(R1, null));
    await publish(env, release(R2, R1, TWO));
    const response = await rollbackRelease(post({
      workspaceId: WORKSPACE, sourceReleaseId: R1, releaseId: R3, expectedActiveReleaseId: R2,
      allocations: [{ itemKey: ITEM, unitPriceDzd: PRICE, quantity: 5 }],
    }), env, STOREFRONT);
    expect(response.status).toBeLessThan(300);
    expect(offersOf(database, R3)).toBeNull();
  });
});
