import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";

const paths = vi.hoisted(() => {
  const root = `${process.env.SF_TEST_ROOT}/shop-registry-tests`;
  return {
    root,
    shopsDir: `${root}/shops`,
    registryPath: `${root}/shop-registry.json`,
    legacyAppMetaPath: `${root}/app-meta.json`,
    quarantineDir: `${root}/quarantine/shops`,
    shopTemplatePath: `${root}/system/shop-template.db`,
  };
});

vi.mock("../paths", () => ({
  ...paths,
  appMetaPath: paths.registryPath,
  prismaSchemaPath: `${paths.root}/prisma/schema.prisma`,
}));
vi.mock("@/lib/db", () => ({ invalidateShopClient: vi.fn() }));

import {
  ShopRegistryError,
  createShop,
  deleteShop,
  getActiveShopId,
  getRegistry,
  getShop,
  listShops,
  setActiveShopId,
} from "../index";

beforeEach(() => {
  rmSync(paths.root, { recursive: true, force: true });
  mkdirSync(paths.shopsDir, { recursive: true });
  mkdirSync(`${paths.root}/system`, { recursive: true });
  writeFileSync(paths.shopTemplatePath, "migrated-template");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("atomic shop registry", () => {
  it("creates an explicit empty versioned registry without a fallback shop", () => {
    expect(listShops()).toEqual([]);
    expect(getActiveShopId()).toBeNull();

    const registry = getRegistry();
    expect(registry.formatVersion).toBe(1);
    expect(registry.revision).toBe(0);
    expect(registry.installationId).toBeTruthy();
    expect(existsSync(paths.registryPath)).toBe(true);
  });

  it("does not recreate a missing registry after production bootstrap", () => {
    vi.stubEnv("NODE_ENV", "production");

    expect(() => getRegistry()).toThrowError(
      expect.objectContaining({ code: "REGISTRY_MISSING" }),
    );
    expect(existsSync(paths.registryPath)).toBe(false);
  });

  it("provisions a migrated database before atomically registering a shop", () => {
    const shop = createShop({ name: "Boutique Elegante" });

    expect(shop.id).toBe("boutique-elegante");
    expect(shop.databaseFile).toBe("boutique-elegante.db");
    expect(readFileSync(`${paths.shopsDir}/${shop.databaseFile}`, "utf8")).toBe(
      "migrated-template",
    );
    expect(getActiveShopId()).toBe(shop.id);
    expect(getRegistry().revision).toBe(1);
  });

  it("increments the revision when the active shop changes", () => {
    const first = createShop({ name: "First" });
    const second = createShop({ name: "Second" });
    setActiveShopId(second.id);

    expect(getActiveShopId()).toBe(second.id);
    expect(getRegistry().revision).toBe(3);
    expect(first.id).not.toBe(second.id);
  });

  it("rejects production switching without changing the registry", () => {
    const first = createShop({ name: "First" });
    const second = createShop({ name: "Second" });
    const revision = getRegistry().revision;
    vi.stubEnv("NODE_ENV", "production");

    expect(() => setActiveShopId(second.id)).toThrowError(
      expect.objectContaining({ code: "SHOP_SWITCH_SUPERVISOR_REQUIRED" }),
    );
    expect(getActiveShopId()).toBe(first.id);
    expect(getRegistry().revision).toBe(revision);
  });

  it("fails closed on malformed registry JSON", () => {
    writeFileSync(paths.registryPath, "{broken");
    expect(() => listShops()).toThrowError(ShopRegistryError);
    expect(() => listShops()).toThrow(/Could not parse/);
  });

  it("fails closed when a registered database is missing", () => {
    writeFileSync(
      paths.registryPath,
      JSON.stringify({
        formatVersion: 1,
        revision: 1,
        installationId: "installation-a",
        activeShopId: "missing",
        shops: [
          {
            id: "missing",
            name: "Missing",
            databaseFile: "missing.db",
            icon: null,
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    );
    expect(() => listShops()).toThrow(/Database file is missing/);
  });

  it("rejects database path traversal", () => {
    writeFileSync(
      paths.registryPath,
      JSON.stringify({
        formatVersion: 1,
        revision: 1,
        installationId: "installation-a",
        activeShopId: "unsafe",
        shops: [
          {
            id: "unsafe",
            name: "Unsafe",
            databaseFile: "..\\seller.db",
            icon: null,
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    );
    expect(() => listShops()).toThrow(/invalid database file identity/);
  });

  it("imports a coherent legacy registry without deleting the legacy source", () => {
    writeFileSync(`${paths.shopsDir}/dev.db`, "seller-data");
    writeFileSync(
      paths.legacyAppMetaPath,
      JSON.stringify({
        activeShopId: "default",
        shops: [
          {
            id: "default",
            name: "Ma Boutique",
            dbPath: "data/shops/dev.db",
            icon: null,
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      }),
    );

    const shops = listShops();

    expect(shops).toHaveLength(1);
    expect(shops[0]?.databaseFile).toBe("dev.db");
    expect(getRegistry().revision).toBe(1);
    expect(existsSync(paths.legacyAppMetaPath)).toBe(true);
    expect(readFileSync(`${paths.shopsDir}/dev.db`, "utf8")).toBe("seller-data");
  });

  it("rejects a non-empty canonical registry with revision zero", () => {
    writeFileSync(`${paths.shopsDir}/dev.db`, "seller-data");
    writeFileSync(
      paths.registryPath,
      JSON.stringify({
        formatVersion: 1,
        revision: 0,
        installationId: "installation-a",
        activeShopId: "default",
        shops: [
          {
            id: "default",
            name: "Ma Boutique",
            databaseFile: "dev.db",
            icon: null,
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      }),
    );

    expect(() => getRegistry()).toThrow(/positive revision/);
  });

  it("quarantines a deleted shop instead of unlinking its database", () => {
    const first = createShop({ name: "First" });
    const second = createShop({ name: "Second" });
    deleteShop(second.id);

    expect(getShop(second.id)).toBeNull();
    expect(getShop(first.id)).not.toBeNull();
    expect(existsSync(`${paths.shopsDir}/${second.databaseFile}`)).toBe(false);
    expect(existsSync(paths.quarantineDir)).toBe(true);
  });

  it("rejects mutation while the registry lock is held", () => {
    listShops();
    writeFileSync(`${paths.registryPath}.lock`, "busy");
    expect(() => createShop({ name: "Blocked" })).toThrow(/registry is busy/i);
  });
});
