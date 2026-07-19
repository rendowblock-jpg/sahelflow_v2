import "server-only";

import {
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { invalidateShopClient } from "@/lib/db";
import { SahelFlowError } from "@/types/errors";
import {
  appMetaPath,
  legacyAppMetaPath,
  prismaSchemaPath,
  quarantineDir,
  registryPath,
  shopTemplatePath,
  shopsDir,
} from "./paths";

export const SHOP_REGISTRY_FORMAT_VERSION = 1;
const MAX_SHOPS = 10;

export interface Shop {
  id: string;
  name: string;
  databaseFile: string;
  icon: string | null;
  createdAt: string;
}

export interface ShopRegistry {
  formatVersion: 1;
  revision: number;
  installationId: string;
  activeShopId: string | null;
  shops: Shop[];
}

type LegacyRegistry = {
  activeShopId?: string | null;
  shops?: Array<{
    id?: string;
    name?: string;
    dbPath?: string;
    icon?: string | null;
    createdAt?: string;
  }>;
};

export class ShopRegistryError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "ShopRegistryError";
  }
}

function databasePath(shop: Shop): string {
  const safeName = basename(shop.databaseFile);
  if (safeName !== shop.databaseFile || !/^[a-z0-9][a-z0-9-]*\.db$/.test(safeName)) {
    throw new ShopRegistryError(
      `Shop ${shop.id} has an invalid database file identity`,
      "REGISTRY_DATABASE_FILE_INVALID",
    );
  }
  return join(shopsDir, safeName);
}

function validateShop(value: unknown): Shop {
  if (!value || typeof value !== "object") {
    throw new ShopRegistryError("Registry contains an invalid shop", "REGISTRY_SHOP_INVALID");
  }
  const shop = value as Partial<Shop>;
  if (!shop.id || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(shop.id)) {
    throw new ShopRegistryError("Registry contains an invalid shop ID", "REGISTRY_SHOP_ID_INVALID");
  }
  if (!shop.name?.trim() || !shop.databaseFile || !shop.createdAt) {
    throw new ShopRegistryError(`Shop ${shop.id} is incomplete`, "REGISTRY_SHOP_INVALID");
  }
  const validated: Shop = {
    id: shop.id,
    name: shop.name.trim(),
    databaseFile: shop.databaseFile,
    icon: typeof shop.icon === "string" ? shop.icon : null,
    createdAt: shop.createdAt,
  };
  databasePath(validated);
  return validated;
}

function validateRegistry(value: unknown, requireFiles = true): ShopRegistry {
  if (!value || typeof value !== "object") {
    throw new ShopRegistryError("Shop registry is not an object", "REGISTRY_INVALID");
  }
  const registry = value as Partial<ShopRegistry>;
  if (registry.formatVersion !== SHOP_REGISTRY_FORMAT_VERSION) {
    throw new ShopRegistryError(
      `Unsupported shop registry format ${String(registry.formatVersion)}`,
      "REGISTRY_VERSION_UNSUPPORTED",
    );
  }
  if (!Number.isSafeInteger(registry.revision) || (registry.revision ?? -1) < 0) {
    throw new ShopRegistryError("Registry revision is invalid", "REGISTRY_REVISION_INVALID");
  }
  if (!registry.installationId || !Array.isArray(registry.shops)) {
    throw new ShopRegistryError("Registry identity or shop list is missing", "REGISTRY_INVALID");
  }

  const shops = registry.shops.map(validateShop);
  if (shops.length > 0 && registry.revision === 0) {
    throw new ShopRegistryError(
      "A non-empty shop registry must have a positive revision",
      "REGISTRY_REVISION_INVALID",
    );
  }
  if (new Set(shops.map((shop) => shop.id)).size !== shops.length) {
    throw new ShopRegistryError("Registry contains duplicate shop IDs", "REGISTRY_DUPLICATE_SHOP");
  }
  if (new Set(shops.map((shop) => shop.databaseFile)).size !== shops.length) {
    throw new ShopRegistryError(
      "Registry assigns one database file to multiple shops",
      "REGISTRY_DUPLICATE_DATABASE",
    );
  }
  if (registry.activeShopId && !shops.some((shop) => shop.id === registry.activeShopId)) {
    throw new ShopRegistryError("Active shop is not registered", "REGISTRY_ACTIVE_SHOP_INVALID");
  }
  if (requireFiles) {
    for (const shop of shops) {
      if (!existsSync(databasePath(shop))) {
        throw new ShopRegistryError(
          `Database file is missing for shop ${shop.id}`,
          "REGISTRY_DATABASE_MISSING",
        );
      }
    }
  }

  return {
    formatVersion: SHOP_REGISTRY_FORMAT_VERSION,
    revision: registry.revision!,
    installationId: registry.installationId,
    activeShopId: registry.activeShopId ?? null,
    shops,
  };
}

function parseJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new ShopRegistryError(
      `Could not parse ${path}: ${error instanceof Error ? error.message : String(error)}`,
      "REGISTRY_CORRUPT",
    );
  }
}

function writeRegistryFile(registry: ShopRegistry): void {
  mkdirSync(dirname(registryPath), { recursive: true });
  const tempPath = `${registryPath}.${process.pid}.${randomUUID()}.tmp`;
  const handle = openSync(tempPath, "wx", 0o600);
  try {
    writeFileSync(handle, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
    fsyncSync(handle);
  } finally {
    closeSync(handle);
  }
  try {
    renameSync(tempPath, registryPath);
  } catch (error) {
    rmSync(tempPath, { force: true });
    throw error;
  }
}

function withRegistryLock<T>(operation: () => T): T {
  mkdirSync(dirname(registryPath), { recursive: true });
  const lockPath = `${registryPath}.lock`;
  let lock: number;
  try {
    lock = openSync(lockPath, "wx", 0o600);
  } catch {
    throw new ShopRegistryError("Shop registry is busy", "REGISTRY_LOCKED");
  }
  try {
    return operation();
  } finally {
    closeSync(lock);
    unlinkSync(lockPath);
  }
}

function emptyRegistry(): ShopRegistry {
  return {
    formatVersion: SHOP_REGISTRY_FORMAT_VERSION,
    revision: 0,
    installationId: randomUUID(),
    activeShopId: null,
    shops: [],
  };
}

function registryBootstrapFallback(): ShopRegistry {
  if (process.env.NODE_ENV === "production") {
    throw new ShopRegistryError(
      "The canonical shop registry is missing after desktop bootstrap",
      "REGISTRY_MISSING",
    );
  }
  return existsSync(legacyAppMetaPath) ? importLegacyRegistry() : emptyRegistry();
}

function importLegacyRegistry(): ShopRegistry {
  const legacy = parseJson(legacyAppMetaPath) as LegacyRegistry;
  if (!Array.isArray(legacy.shops)) {
    throw new ShopRegistryError("Legacy registry has no shop list", "LEGACY_REGISTRY_INVALID");
  }
  const shops = legacy.shops.map((shop) => {
    if (!shop.id || !shop.name || !shop.dbPath) {
      throw new ShopRegistryError("Legacy registry contains an incomplete shop", "LEGACY_REGISTRY_INVALID");
    }
    const candidate = resolve(process.cwd(), shop.dbPath);
    const dataRelative = relative(resolve(process.cwd(), "data"), candidate);
    const legacyPath =
      !dataRelative.startsWith("..") && !dataRelative.startsWith("/")
        ? resolve(dirname(legacyAppMetaPath), dataRelative)
        : candidate;
    const file = basename(legacyPath);
    const canonicalPath = join(shopsDir, file);
    if (resolve(legacyPath) !== resolve(canonicalPath) || !existsSync(canonicalPath)) {
      throw new ShopRegistryError(
        `Legacy database for ${shop.id} is missing or outside the canonical data root`,
        "LEGACY_DATABASE_AMBIGUOUS",
      );
    }
    return validateShop({
      id: shop.id,
      name: shop.name,
      databaseFile: file,
      icon: shop.icon ?? null,
      createdAt: shop.createdAt ?? new Date().toISOString(),
    });
  });
  return validateRegistry(
    {
      formatVersion: SHOP_REGISTRY_FORMAT_VERSION,
      revision: 1,
      installationId: randomUUID(),
      activeShopId: legacy.activeShopId ?? shops[0]?.id ?? null,
      shops,
    },
    true,
  );
}

function ensureRegistry(): ShopRegistry {
  if (existsSync(registryPath)) {
    return validateRegistry(parseJson(registryPath));
  }
  return withRegistryLock(() => {
    if (existsSync(registryPath)) return validateRegistry(parseJson(registryPath));
    const registry = registryBootstrapFallback();
    writeRegistryFile(registry);
    return registry;
  });
}

function mutateRegistry(mutator: (registry: ShopRegistry) => void): ShopRegistry {
  return withRegistryLock(() => {
    const registry = existsSync(registryPath)
      ? validateRegistry(parseJson(registryPath))
      : registryBootstrapFallback();
    mutator(registry);
    registry.revision += 1;
    const validated = validateRegistry(registry);
    writeRegistryFile(validated);
    return validated;
  });
}

function generateShopId(name: string, existing: Shop[]): string {
  const base =
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 30) || "shop";
  let id = base;
  let suffix = 2;
  while (existing.some((shop) => shop.id === id)) id = `${base}-${suffix++}`;
  return id;
}

function provisionDatabase(target: string): void {
  mkdirSync(dirname(target), { recursive: true });
  if (existsSync(shopTemplatePath)) {
    copyFileSync(shopTemplatePath, target);
    return;
  }
  if (process.env.NODE_ENV === "production") {
    throw new ShopRegistryError(
      "The desktop migration coordinator did not prepare a shop template",
      "SHOP_TEMPLATE_MISSING",
    );
  }
  const result = spawnSync(
    "bunx",
    ["prisma", "migrate", "deploy", `--schema=${prismaSchemaPath}`],
    {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: `file:${target}` },
      encoding: "utf8",
      shell: process.platform === "win32",
    },
  );
  if (result.status !== 0) {
    rmSync(target, { force: true });
    throw new ShopRegistryError(
      result.stderr || "Could not initialize the shop database",
      "SHOP_PROVISION_FAILED",
    );
  }
}

export function getRegistry(): ShopRegistry {
  return ensureRegistry();
}

export function listShops(): Shop[] {
  return ensureRegistry().shops;
}

export function getActiveShopId(): string | null {
  return ensureRegistry().activeShopId;
}

export function setActiveShopId(shopId: string): void {
  if (process.env.NODE_ENV === "production") {
    throw new SahelFlowError(
      "Shop switching is blocked until the desktop supervisor can own the process transition",
      "SHOP_SWITCH_SUPERVISOR_REQUIRED",
      503,
    );
  }
  mutateRegistry((registry) => {
    if (!registry.shops.some((shop) => shop.id === shopId)) {
      throw new ShopRegistryError(`Shop ${shopId} not found`, "SHOP_NOT_FOUND");
    }
    registry.activeShopId = shopId;
  });
}

export function getActiveShop(): Shop | null {
  const registry = ensureRegistry();
  return registry.shops.find((shop) => shop.id === registry.activeShopId) ?? null;
}

export function createShop(input: { name: string; icon?: string | null }): Shop {
  const name = input.name.trim();
  if (!name) throw new ShopRegistryError("Shop name is required", "SHOP_NAME_REQUIRED");

  return withRegistryLock(() => {
    const registry = existsSync(registryPath)
      ? validateRegistry(parseJson(registryPath))
      : registryBootstrapFallback();
    if (registry.shops.length >= MAX_SHOPS) {
      throw new ShopRegistryError(`Maximum ${MAX_SHOPS} shops allowed`, "SHOP_LIMIT_REACHED");
    }
    const id = generateShopId(name, registry.shops);
    const shop: Shop = {
      id,
      name,
      databaseFile: `${id}.db`,
      icon: input.icon ?? null,
      createdAt: new Date().toISOString(),
    };
    const target = databasePath(shop);
    const staging = `${target}.${randomUUID()}.provisioning`;
    provisionDatabase(staging);
    renameSync(staging, target);

    registry.shops.push(shop);
    registry.activeShopId ??= id;
    registry.revision += 1;
    try {
      writeRegistryFile(validateRegistry(registry));
    } catch (error) {
      mkdirSync(quarantineDir, { recursive: true });
      renameSync(target, join(quarantineDir, `${id}-${Date.now()}.db`));
      throw error;
    }
    return shop;
  });
}

export function deleteShop(shopId: string): void {
  withRegistryLock(() => {
    const registry = validateRegistry(parseJson(registryPath));
    const shop = registry.shops.find((candidate) => candidate.id === shopId);
    if (!shop) throw new ShopRegistryError(`Shop ${shopId} not found`, "SHOP_NOT_FOUND");
    if (registry.shops.length === 1) {
      throw new ShopRegistryError("Cannot delete the last shop", "SHOP_LAST_DELETE_REJECTED");
    }

    const source = databasePath(shop);
    mkdirSync(quarantineDir, { recursive: true });
    const quarantined = join(quarantineDir, `${shop.id}-${Date.now()}.db`);
    invalidateShopClient(source);
    renameSync(source, quarantined);
    registry.shops = registry.shops.filter((candidate) => candidate.id !== shopId);
    if (registry.activeShopId === shopId) registry.activeShopId = registry.shops[0]?.id ?? null;
    registry.revision += 1;
    try {
      writeRegistryFile(validateRegistry(registry));
    } catch (error) {
      renameSync(quarantined, source);
      throw error;
    }
  });
}

export function getShop(shopId: string): Shop | null {
  return ensureRegistry().shops.find((shop) => shop.id === shopId) ?? null;
}

export function getShopDatabasePath(shop: Shop): string {
  return databasePath(shop);
}

export {
  appMetaPath,
  legacyAppMetaPath,
  quarantineDir,
  registryPath,
  shopTemplatePath,
  shopsDir,
};
