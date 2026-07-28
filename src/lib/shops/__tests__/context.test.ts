import { afterEach, describe, expect, it, vi } from "vitest";
import { resolve } from "node:path";
import { processShopContext } from "../context";

describe("process ShopContext", () => {
  const original = {
    workspace: process.env.SF_WORKSPACE_ID,
    installation: process.env.SF_INSTALLATION_ID,
    shop: process.env.SF_ACTIVE_SHOP_ID,
    incarnation: process.env.SF_SHOP_INCARNATION_ID,
    databaseFile: process.env.SF_DATABASE_FILE_ID,
    revision: process.env.SF_REGISTRY_REVISION,
    migration: process.env.SF_MIGRATION_SET_SHA256,
    database: process.env.DATABASE_URL,
  };

  afterEach(() => {
    process.env.SF_WORKSPACE_ID = original.workspace;
    process.env.SF_INSTALLATION_ID = original.installation;
    process.env.SF_ACTIVE_SHOP_ID = original.shop;
    process.env.SF_SHOP_INCARNATION_ID = original.incarnation;
    process.env.SF_DATABASE_FILE_ID = original.databaseFile;
    process.env.SF_REGISTRY_REVISION = original.revision;
    process.env.SF_MIGRATION_SET_SHA256 = original.migration;
    process.env.DATABASE_URL = original.database;
    vi.unstubAllEnvs();
  });

  it("captures an immutable trusted process authority", () => {
    process.env.SF_WORKSPACE_ID = "a".repeat(32);
    process.env.SF_INSTALLATION_ID = "b".repeat(32);
    process.env.SF_ACTIVE_SHOP_ID = "shop-a";
    process.env.SF_SHOP_INCARNATION_ID = "c".repeat(32);
    process.env.SF_DATABASE_FILE_ID = "shop-a.db";
    process.env.SF_REGISTRY_REVISION = "12";
    process.env.SF_MIGRATION_SET_SHA256 = "a".repeat(64);
    process.env.DATABASE_URL = `file:${resolve("shop-context", "shop-a.db")}`;

    const context = processShopContext();

    expect(context).toEqual({
      workspaceId: "a".repeat(32),
      installationId: "b".repeat(32),
      shopId: "shop-a",
      shopIncarnationId: "c".repeat(32),
      registryRevision: 12,
      databaseFileId: "shop-a.db",
      migrationSetSha256: "a".repeat(64),
    });
    expect(Object.isFrozen(context)).toBe(true);
  });

  it("fails closed when production authority is incomplete", () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.SF_WORKSPACE_ID;
    delete process.env.SF_INSTALLATION_ID;
    delete process.env.SF_ACTIVE_SHOP_ID;
    delete process.env.SF_SHOP_INCARNATION_ID;
    delete process.env.SF_DATABASE_FILE_ID;
    delete process.env.SF_REGISTRY_REVISION;
    delete process.env.SF_MIGRATION_SET_SHA256;
    expect(() => processShopContext()).toThrow(/complete trusted ShopContext/);
  });
});
