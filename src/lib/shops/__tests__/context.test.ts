import { afterEach, describe, expect, it, vi } from "vitest";
import { processShopContext } from "../context";

describe("process ShopContext", () => {
  const original = {
    shop: process.env.SF_ACTIVE_SHOP_ID,
    revision: process.env.SF_REGISTRY_REVISION,
    migration: process.env.SF_MIGRATION_SET_SHA256,
    database: process.env.DATABASE_URL,
  };

  afterEach(() => {
    process.env.SF_ACTIVE_SHOP_ID = original.shop;
    process.env.SF_REGISTRY_REVISION = original.revision;
    process.env.SF_MIGRATION_SET_SHA256 = original.migration;
    process.env.DATABASE_URL = original.database;
    vi.unstubAllEnvs();
  });

  it("captures an immutable trusted process authority", () => {
    process.env.SF_ACTIVE_SHOP_ID = "shop-a";
    process.env.SF_REGISTRY_REVISION = "12";
    process.env.SF_MIGRATION_SET_SHA256 = "a".repeat(64);
    process.env.DATABASE_URL = "file:C:\\data\\shops\\shop-a.db";

    const context = processShopContext();

    expect(context).toEqual({
      shopId: "shop-a",
      registryRevision: 12,
      databaseFileId: "shop-a.db",
      migrationSetSha256: "a".repeat(64),
    });
    expect(Object.isFrozen(context)).toBe(true);
  });

  it("fails closed when production authority is incomplete", () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.SF_ACTIVE_SHOP_ID;
    delete process.env.SF_REGISTRY_REVISION;
    delete process.env.SF_MIGRATION_SET_SHA256;
    expect(() => processShopContext()).toThrow(/complete trusted ShopContext/);
  });
});
