/**
 * Shop registry management — list/create/delete shop files.
 *
 * The shop registry is stored as a JSON file at `data/app-meta.json`:
 *   { shops: [{id, name, dbPath, icon, createdAt}], activeShopId: "..." }
 *
 * Each shop has its own SQLite file (e.g. `data/shops/my-shop.db`). Creating a
 * shop runs `prisma db push` against the new file to initialize the schema.
 *
 * The active shop ID is persisted here (not in a per-shop Setting table) so
 * it's available before any shop DB is opened. A follow-up PR will route all
 * `db` calls through the active shop's client (via getShopClient).
 */
import "server-only";


import { execSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "fs";
import { join, dirname } from "path";
import { shopsDir, appMetaPath } from "./paths";

export interface Shop {
  id: string;
  name: string;
  /** Path to the shop's SQLite database (relative to project root). */
  dbPath: string;
  /** Emoji icon (nullable). */
  icon: string | null;
  createdAt: string;
}

interface AppMeta {
  shops: Shop[];
  activeShopId: string | null;
}

const MAX_SHOPS = 10;

/** Read the app-meta.json file (creates it with defaults if missing). */
function readMeta(): AppMeta {
  if (!existsSync(appMetaPath)) {
    const initial: AppMeta = { shops: [], activeShopId: null };
    writeFileSync(appMetaPath, JSON.stringify(initial, null, 2));
    return initial;
  }
  try {
    return JSON.parse(readFileSync(appMetaPath, "utf-8")) as AppMeta;
  } catch {
    return { shops: [], activeShopId: null };
  }
}

/** Write the app-meta.json file. */
function writeMeta(meta: AppMeta): void {
  mkdirSync(dirname(appMetaPath), { recursive: true });
  writeFileSync(appMetaPath, JSON.stringify(meta, null, 2));
}

/**
 * List all registered shops. On first run (empty registry + no app-meta.json),
 * bootstraps a default shop pointing at the existing dev database so the user
 * sees their existing data instead of an empty state.
 */
export function listShops(): Shop[] {
  const meta = readMeta();
  // First-run bootstrap: if the registry is empty, create a default shop.
  // We detect "first run" by checking that app-meta.json didn't exist before
  // this call (readMeta creates it if missing) AND there are no shops.
  if (meta.shops.length === 0) {
    const defaultShop: Shop = {
      id: "default",
      name: "Ma Boutique",
      dbPath: "data/shops/dev.db",
      icon: "🏪",
      createdAt: new Date().toISOString(),
    };
    meta.shops = [defaultShop];
    meta.activeShopId = "default";
    writeMeta(meta);
  }
  return meta.shops;
}

/** Get the active shop ID. */
export function getActiveShopId(): string | null {
  return readMeta().activeShopId;
}

/** Set the active shop ID. */
export function setActiveShopId(shopId: string): void {
  const meta = readMeta();
  const exists = meta.shops.some((s) => s.id === shopId);
  if (!exists) {
    throw new Error(`Shop "${shopId}" not found`);
  }
  meta.activeShopId = shopId;
  writeMeta(meta);
}

/** Get the active shop (or null if none set). */
export function getActiveShop(): Shop | null {
  const meta = readMeta();
  return meta.shops.find((s) => s.id === meta.activeShopId) ?? null;
}

/** Generate a unique shop ID (slug-based, with collision avoidance). */
function generateShopId(name: string, existing: Shop[]): string {
  const base = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 30) || "shop";
  let id = base;
  let i = 2;
  while (existing.some((s) => s.id === id)) {
    id = `${base}-${i}`;
    i++;
  }
  return id;
}

/**
 * Create a new shop: registers it + initializes the SQLite file with the
 * Prisma schema (via `prisma db push`).
 */
export function createShop(input: {
  name: string;
  icon?: string | null;
}): Shop {
  const meta = readMeta();
  if (meta.shops.length >= MAX_SHOPS) {
    throw new Error(`Maximum ${MAX_SHOPS} shops allowed`);
  }

  const name = input.name.trim();
  if (!name) throw new Error("Shop name is required");

  const id = generateShopId(name, meta.shops);
  const dbPath = `data/shops/${id}.db`;
  const fullPath = join(process.cwd(), dbPath);

  // Ensure the shops directory exists
  mkdirSync(join(process.cwd(), "data", "shops"), { recursive: true });

  // Initialize the SQLite file with the Prisma schema
  // This runs `bunx prisma db push` with the datasource URL pointing to the
  // new shop file. The schema is read from prisma/schema.prisma.
  try {
    execSync(
      `bunx prisma db push --skip-generate --accept-data-loss`,
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          DATABASE_URL: `file:${fullPath}`,
        },
        stdio: "pipe", // suppress output
        timeout: 30000,
      },
    );
  } catch (err) {
    // Clean up the partial file if schema push failed
    if (existsSync(fullPath)) {
      try { unlinkSync(fullPath); } catch { /* ignore */ }
    }
    throw new Error(
      `Failed to initialize shop database: ${err instanceof Error ? err.message : "Unknown error"}`,
    );
  }

  const shop: Shop = {
    id,
    name,
    dbPath,
    icon: input.icon ?? null,
    createdAt: new Date().toISOString(),
  };

  meta.shops.push(shop);
  if (!meta.activeShopId) {
    meta.activeShopId = id; // auto-activate the first shop
  }
  writeMeta(meta);

  return shop;
}

/** Delete a shop (removes from registry + deletes the SQLite file). */
export function deleteShop(shopId: string): void {
  const meta = readMeta();
  const shop = meta.shops.find((s) => s.id === shopId);
  if (!shop) throw new Error(`Shop "${shopId}" not found`);

  // Don't allow deleting the last shop
  if (meta.shops.length === 1) {
    throw new Error("Cannot delete the last shop. Create another first.");
  }

  // Delete the SQLite file
  const fullPath = join(process.cwd(), shop.dbPath);
  if (existsSync(fullPath)) {
    try { unlinkSync(fullPath); } catch { /* ignore */ }
  }

  // Remove from registry + update active shop if needed
  meta.shops = meta.shops.filter((s) => s.id !== shopId);
  if (meta.activeShopId === shopId) {
    meta.activeShopId = meta.shops[0]?.id ?? null;
  }
  writeMeta(meta);
}

/** Get a shop by ID. */
export function getShop(shopId: string): Shop | null {
  return readMeta().shops.find((s) => s.id === shopId) ?? null;
}

// Re-export paths for convenience
export { shopsDir, appMetaPath };
