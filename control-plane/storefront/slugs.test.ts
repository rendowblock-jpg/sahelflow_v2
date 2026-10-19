import { describe, expect, it } from "vitest";

import { createStorefront } from "./create-storefront";
import { SLUG } from "./shared";
import { RESERVED_STORE_SLUGS, isReservedStoreSlug } from "./slugs";
import { TEST_WORKSPACE_ID, environment, openDatabase } from "./test-d1";

function createRequest(slug: string): Request {
  return new Request("https://storefront.test/v1/desktop/storefronts", {
    method: "POST",
    headers: { Authorization: "Bearer desktop", "Content-Type": "application/json" },
    body: JSON.stringify({
      workspaceId: TEST_WORKSPACE_ID,
      storefrontId: "storefront_12345678",
      shopId: "shop_12345678",
      slug,
      receiptEncryptionPublicKey: JSON.stringify({ kty: "RSA", n: "a".repeat(40), e: "AQAB" }),
    }),
  });
}

describe("reserved store addresses", () => {
  it("covers every SahelFlow host and every route word of the storefront Worker", () => {
    for (const word of [
      "healthz", "connect", "shop", "backup", "license", "licence", "activate", "www", "mcp", "app",
      "staging", "api", "admin", "support", "sahelflow", "static", "assets", "robots", "favicon",
    ]) {
      expect(isReservedStoreSlug(word), word).toBe(true);
    }
  });

  it("only lists words that could otherwise be chosen as a store address", () => {
    const dead = [...RESERVED_STORE_SLUGS].filter((word) => !SLUG.test(word));
    expect(dead).toEqual([]);
  });

  it("does not reserve ordinary shop names", () => {
    for (const word of ["sahel-store", "boutique-alger", "my-shop-2", "tapis"]) {
      expect(isReservedStoreSlug(word), word).toBe(false);
    }
  });

  it("refuses to create a store on a reserved address and creates nothing", async () => {
    const database = openDatabase();
    const response = await createStorefront(createRequest("healthz"), environment(database));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "slug_reserved" });
    expect(database.prepare("SELECT COUNT(*) AS n FROM storefront").get()).toMatchObject({ n: 0 });
    database.close();
  });

  it("still creates a store on an ordinary address", async () => {
    const database = openDatabase();
    const response = await createStorefront(createRequest("sahel-store"), environment(database));
    expect(response.status).toBe(201);
    expect(database.prepare("SELECT slug FROM storefront").get()).toMatchObject({ slug: "sahel-store" });
    database.close();
  });
});
