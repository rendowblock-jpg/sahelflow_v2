/**
 * Shop registry tests — listShops / createShop / deleteShop / setActiveShopId.
 *
 * The shops module reads + writes data/app-meta.json (relative to process.cwd)
 * and createShop shells out to `bunx prisma db push`. To isolate:
 *   - Mock `../paths` to point app-meta at a temp dir.
 *   - Mock `child_process` so createShop doesn't actually run prisma.
 *   - Mock `process.cwd()` so the mkdirSync(join(cwd, "data", "shops")) call
 *     inside createShop writes to the temp dir too.
 */
import { describe, it, expect, beforeEach, vi, beforeAll, afterAll } from "vitest";
import { existsSync, readFileSync, rmSync, mkdirSync } from "fs";
import { join } from "path";
import {  } from "os";

// vi.mock factories are hoisted ABOVE top-level const declarations, so we
// must use vi.hoisted to make TMP_ROOT available to the mock factory.
const { TMP_ROOT } = vi.hoisted(() => ({
  // Fixed /tmp prefix — avoids needing `path`/`os` imports inside the hoisted
  // factory (which runs before ESM imports resolve). OS tmpdir is /tmp on Linux/macOS.
  TMP_ROOT: `/tmp/sf-shops-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
}));
mkdirSync(TMP_ROOT, { recursive: true });
// Pre-create the data/ subdirectory: the source's readMeta() calls
// writeFileSync(appMetaPath) without mkdir-ing the parent first, so the
// directory must already exist when listShops() runs.
mkdirSync(join(TMP_ROOT, "data"), { recursive: true });

vi.mock("../paths", () => ({
  shopsDir: join(TMP_ROOT, "data", "shops"),
  appMetaPath: join(TMP_ROOT, "data", "app-meta.json"),
  prismaSchemaPath: join(TMP_ROOT, "prisma", "schema.prisma"),
}));

vi.mock("child_process", () => ({
  execSync: () => Buffer.from(""),
}));

// Import AFTER mocks are in place.
import {
  listShops,
  getActiveShopId,
  setActiveShopId,
  getActiveShop,
  createShop,
  deleteShop,
  getShop,
  appMetaPath,
} from "../index";
import { invalidateShopClient } from "@/lib/db";

beforeAll(() => {
  vi.spyOn(process, "cwd").mockReturnValue(TMP_ROOT);
});

afterAll(() => {
  if (existsSync(TMP_ROOT)) {
    try { rmSync(TMP_ROOT, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

beforeEach(() => {
  // Wipe app-meta.json between tests so each starts from a clean slate.
  if (existsSync(appMetaPath)) {
    rmSync(appMetaPath, { force: true });
  }
});

// ── listShops (first-run bootstrap) ─────────────────────────────────────────

describe("listShops", () => {
  it("bootstraps a default shop on first run (empty registry)", () => {
    const shops = listShops();
    expect(shops).toHaveLength(1);
    expect(shops[0]!.id).toBe("default");
    expect(shops[0]!.name).toBe("Ma Boutique");
    expect(shops[0]!.dbPath).toBe("data/shops/dev.db");
    expect(shops[0]!.icon).toBe("🏪");
    expect(shops[0]!.createdAt).toBeTruthy();
    // app-meta.json was created on disk
    expect(existsSync(appMetaPath)).toBe(true);
  });

  it("returns the existing shops without re-bootstrapping", () => {
    // First call bootstraps
    const first = listShops();
    expect(first).toHaveLength(1);
    // Second call returns the same list (no duplicates)
    const second = listShops();
    expect(second).toHaveLength(1);
    expect(second[0]!.id).toBe("default");
  });
});

// ── getActiveShopId / setActiveShopId / getActiveShop ───────────────────────

describe("getActiveShopId / setActiveShopId / getActiveShop", () => {
  it("getActiveShopId returns null when no shops exist", () => {
    // No app-meta.json yet, no bootstrap call
    expect(getActiveShopId()).toBeNull();
  });

  it("bootstrap sets activeShopId to 'default'", () => {
    listShops();
    expect(getActiveShopId()).toBe("default");
  });

  it("setActiveShopId updates the active shop", () => {
    listShops();
    const shop2 = createShop({ name: "Second Shop" });
    setActiveShopId(shop2.id);
    expect(getActiveShopId()).toBe(shop2.id);
  });

  it("setActiveShopId throws for an unknown shop id", () => {
    listShops();
    expect(() => setActiveShopId("nonexistent")).toThrow(/not found/i);
  });

  it("getActiveShop returns the active Shop object", () => {
    listShops();
    const active = getActiveShop();
    expect(active).not.toBeNull();
    expect(active!.id).toBe("default");
  });

  it("getActiveShop returns null when activeShopId is null", () => {
    expect(getActiveShop()).toBeNull();
  });
});

// ── createShop ──────────────────────────────────────────────────────────────

describe("createShop", () => {
  it("creates a shop with a slug-based id derived from the name", () => {
    listShops();
    const shop = createShop({ name: "My New Shop" });
    expect(shop.id).toBe("my-new-shop");
    expect(shop.name).toBe("My New Shop");
    expect(shop.dbPath).toBe(`data/shops/${shop.id}.db`);
    expect(shop.icon).toBeNull();
    expect(shop.createdAt).toBeTruthy();
  });

  it("normalizes accents in the slug", () => {
    listShops();
    const shop = createShop({ name: "Boutique Élégante" });
    expect(shop.id).toBe("boutique-elegante");
  });

  it("auto-activates the first shop when no active is set", () => {
    // Don't call listShops first — go straight to createShop with empty registry.
    const shop = createShop({ name: "First Shop" });
    expect(getActiveShopId()).toBe(shop.id);
  });

  it("does NOT auto-activate when an active shop already exists", () => {
    listShops(); // bootstraps + activates 'default'
    const shop = createShop({ name: "Second" });
    expect(getActiveShopId()).toBe("default");
    expect(shop.id).not.toBe("default");
  });

  it("persists the new shop in the registry (visible via listShops)", () => {
    listShops();
    const shop = createShop({ name: "Persistent" });
    const all = listShops();
    expect(all.find((s) => s.id === shop.id)).toBeDefined();
  });

  it("throws when the name is empty or whitespace", () => {
    listShops();
    expect(() => createShop({ name: "" })).toThrow(/name is required/i);
    expect(() => createShop({ name: "   " })).toThrow(/name is required/i);
  });

  it("avoids id collisions by appending a suffix (-2, -3, ...)", () => {
    listShops();
    const s1 = createShop({ name: "Same Name" });
    const s2 = createShop({ name: "Same Name" });
    const s3 = createShop({ name: "Same Name" });
    expect(s1.id).toBe("same-name");
    expect(s2.id).toBe("same-name-2");
    expect(s3.id).toBe("same-name-3");
  });

  it("throws when at the MAX_SHOPS limit (10)", () => {
    // Bootstrap + create 9 more to hit 10 total
    listShops();
    for (let i = 0; i < 9; i++) {
      createShop({ name: `Shop ${i}` });
    }
    expect(() => createShop({ name: "Eleventh" })).toThrow(/Maximum 10 shops/i);
  });

  it("stores the icon when provided", () => {
    listShops();
    const shop = createShop({ name: "Icon Shop", icon: "🛍️" });
    expect(shop.icon).toBe("🛍️");
  });
});

// ── deleteShop ──────────────────────────────────────────────────────────────

describe("deleteShop", () => {
  it("removes the shop from the registry", () => {
    listShops();
    const shop = createShop({ name: "To Delete" });
    deleteShop(shop.id);
    expect(getShop(shop.id)).toBeNull();
  });

  it("throws for an unknown shop id", () => {
    listShops();
    expect(() => deleteShop("nonexistent")).toThrow(/not found/i);
  });

  it("throws when trying to delete the last shop", () => {
    listShops();
    // Only the bootstrap 'default' exists
    expect(() => deleteShop("default")).toThrow(/last shop/i);
  });

  it("updates activeShopId if the active shop was deleted", () => {
    listShops();
    const shop2 = createShop({ name: "Second" });
    setActiveShopId(shop2.id);
    deleteShop(shop2.id);
    // activeShopId should fall back to the remaining shop
    expect(getActiveShopId()).toBe("default");
  });

  it("can delete a non-active shop without changing activeShopId", () => {
    listShops();
    const shop2 = createShop({ name: "Second" });
    // 'default' is still active
    deleteShop(shop2.id);
    expect(getActiveShopId()).toBe("default");
  });
});

// ── getShop ─────────────────────────────────────────────────────────────────

describe("getShop", () => {
  it("returns the shop by id", () => {
    listShops();
    const shop = getShop("default");
    expect(shop).not.toBeNull();
    expect(shop!.name).toBe("Ma Boutique");
  });

  it("returns null for an unknown id", () => {
    expect(getShop("nonexistent")).toBeNull();
  });
});

// ── readMeta raw (smoke test for on-disk format) ───────────────────────────

describe("app-meta.json on-disk format", () => {
  it("is valid JSON with shops[] + activeShopId after bootstrap", () => {
    listShops();
    const raw = readFileSync(appMetaPath, "utf-8");
    const parsed = JSON.parse(raw);
    expect(Array.isArray(parsed.shops)).toBe(true);
    expect(parsed.shops.length).toBeGreaterThan(0);
    expect(typeof parsed.activeShopId).toBe("string");
  });
});

// ── deleteShop cache invalidation (AUDIT-3 S7, Session 31) ──────────────────
//
// deleteShop unlinks the shop's SQLite file but, before Session 31, never
// invalidated the in-process PrismaClient cached in globalForPrisma.shopClients
// — leaving a stale connection to a deleted file. These tests verify the fix:
// invalidateShopClient removes the cached entry + calls $disconnect, and
// deleteShop invokes it for the deleted shop's dbPath.
describe("deleteShop — cache invalidation (AUDIT-3 S7)", () => {
  function getShopClientsMap(): Map<string, unknown> {
    const g = globalThis as unknown as { shopClients?: Map<string, unknown> };
    if (!g.shopClients) g.shopClients = new Map();
    return g.shopClients;
  }

  it("invalidateShopClient removes the cached client + calls $disconnect", async () => {
    const cache = getShopClientsMap();
    const testPath = "/tmp/sf-test-invalidate-shop-client.db";
    const mockDisconnect = vi.fn().mockResolvedValue(undefined);
    cache.set(testPath, { $disconnect: mockDisconnect });
    expect(cache.has(testPath)).toBe(true);

    invalidateShopClient(testPath);

    expect(cache.has(testPath)).toBe(false);
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });

  it("invalidateShopClient is a no-op for a path that was never cached", () => {
    const cache = getShopClientsMap();
    const before = cache.size;
    invalidateShopClient("/tmp/sf-test-never-cached.db");
    expect(cache.size).toBe(before); // unchanged
  });

  it("deleteShop invalidates the cached client for the deleted shop's dbPath", () => {
    listShops();
    const shop = createShop({ name: "Cache Test" });
    const fullPath = join(TMP_ROOT, shop.dbPath);

    // Populate the cache with a mock client for this shop's path (simulates
    // the shop having been opened/queried before deletion).
    const cache = getShopClientsMap();
    const mockDisconnect = vi.fn().mockResolvedValue(undefined);
    cache.set(fullPath, { $disconnect: mockDisconnect });
    expect(cache.has(fullPath)).toBe(true);

    deleteShop(shop.id);

    // The cached client for the deleted shop's path must be invalidated.
    expect(cache.has(fullPath)).toBe(false);
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });
});
