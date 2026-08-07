import "server-only";

import { PrismaClient } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

import { getMasterKey } from "@/lib/crypto/master-key";
import {
  migrateShopProtectedData,
  type ProtectedDataMigrationStats,
} from "@/lib/maintenance/protected-data-migration";
import type { ShopContext } from "@/lib/shops/context";

const APPLY = process.argv.includes("--apply");
const VERIFY = process.argv.includes("--verify") || !APPLY;
const RECOVER_STALE_LOCK = process.argv.includes("--recover-stale-lock");
const DATA_DIR = process.env.SF_DATA_DIR
  ? resolve(process.env.SF_DATA_DIR)
  : resolve(process.cwd(), "data");
const LOCK_PATH = join(DATA_DIR, "protected-data-migration-v1.lock");
const RUNTIME_MANIFEST_PATH = join(DATA_DIR, "runtime-endpoint.json");
const REGISTRY_PATH = join(DATA_DIR, "shop-registry.json");
const SHOPS_DIR = join(DATA_DIR, "shops");
const RESCUE_ROOT = join(DATA_DIR, "migration-rescue", "protected-data-v1");

interface RuntimeManifest {
  processId?: unknown;
  state?: unknown;
}

interface Shop {
  id: string;
  incarnationId: string;
  databaseFile: string;
}

interface ShopRegistry {
  formatVersion: 2;
  revision: number;
  workspaceId: string;
  installationId: string;
  shops: Shop[];
}

interface MigrationLockRecord {
  formatVersion: 1;
  ownerPid: number;
  mode: "verify" | "apply";
  createdAt: string;
  token: string;
}

interface MigrationLease {
  handle: number;
  record: MigrationLockRecord;
}

interface RescueEntry {
  shop: Shop;
  source: string;
  rescue: string;
}

function errorCode(error: unknown): string | undefined {
  return error && typeof error === "object" && "code" in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return errorCode(error) !== "ESRCH";
  }
}

function assertIdentity(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !/^[0-9a-f]{32}$/i.test(value)) {
    throw new Error(`${label} is invalid`);
  }
}

function parseRegistry(): ShopRegistry {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(REGISTRY_PATH, "utf8"));
  } catch (cause) {
    throw new Error(`Could not read canonical shop registry: ${String(cause)}`);
  }
  if (!value || typeof value !== "object") {
    throw new Error("Canonical shop registry is not an object");
  }
  const registry = value as Partial<ShopRegistry>;
  if (
    registry.formatVersion !== 2 ||
    !Number.isSafeInteger(registry.revision) ||
    (registry.revision ?? 0) < 1 ||
    !Array.isArray(registry.shops)
  ) {
    throw new Error("Canonical shop registry is invalid or unsupported");
  }
  assertIdentity(registry.workspaceId, "Registry workspace identity");
  assertIdentity(registry.installationId, "Registry installation identity");

  const shops = registry.shops.map((candidate) => {
    if (!candidate || typeof candidate !== "object") {
      throw new Error("Registry contains an invalid shop");
    }
    const shop = candidate as Partial<Shop>;
    if (!shop.id || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(shop.id)) {
      throw new Error("Registry contains an invalid shop ID");
    }
    assertIdentity(shop.incarnationId, `Shop ${shop.id} incarnation identity`);
    if (
      !shop.databaseFile ||
      basename(shop.databaseFile) !== shop.databaseFile ||
      !/^[a-z0-9][a-z0-9-]*\.db$/.test(shop.databaseFile)
    ) {
      throw new Error(`Shop ${shop.id} has an invalid database file`);
    }
    return {
      id: shop.id,
      incarnationId: shop.incarnationId,
      databaseFile: shop.databaseFile,
    };
  });

  return {
    formatVersion: 2,
    revision: registry.revision!,
    workspaceId: registry.workspaceId,
    installationId: registry.installationId,
    shops,
  };
}

function databasePath(shop: Shop): string {
  const path = join(SHOPS_DIR, shop.databaseFile);
  if (!existsSync(path)) {
    throw new Error(`Registered shop database is missing: ${path}`);
  }
  return path;
}

function assertRuntimeStopped(): void {
  if (!existsSync(RUNTIME_MANIFEST_PATH)) return;
  let manifest: RuntimeManifest;
  try {
    manifest = JSON.parse(
      readFileSync(RUNTIME_MANIFEST_PATH, "utf8"),
    ) as RuntimeManifest;
  } catch (cause) {
    throw new Error(
      `Runtime manifest is unreadable; fail closed before migration: ${String(cause)}`,
    );
  }
  if (
    Number.isSafeInteger(manifest.processId) &&
    (manifest.processId as number) > 0 &&
    processIsAlive(manifest.processId as number)
  ) {
    throw new Error(
      `SahelFlow runtime PID ${String(manifest.processId)} is still active; close the app before protected-data migration`,
    );
  }
}

function parseLock(value: unknown): MigrationLockRecord {
  if (!value || typeof value !== "object") {
    throw new Error("Protected-data migration lock is not an object");
  }
  const record = value as Partial<MigrationLockRecord>;
  if (
    record.formatVersion !== 1 ||
    !Number.isSafeInteger(record.ownerPid) ||
    (record.ownerPid ?? 0) < 1 ||
    (record.mode !== "verify" && record.mode !== "apply") ||
    typeof record.createdAt !== "string" ||
    Number.isNaN(Date.parse(record.createdAt)) ||
    typeof record.token !== "string" ||
    !/^[0-9a-f]{32}$/i.test(record.token)
  ) {
    throw new Error("Protected-data migration lock is malformed");
  }
  return record as MigrationLockRecord;
}

function readLock(): MigrationLockRecord {
  return parseLock(JSON.parse(readFileSync(LOCK_PATH, "utf8")));
}

function removeStaleLock(expectedToken: string | null): void {
  if (!existsSync(LOCK_PATH)) return;
  if (expectedToken !== null && readLock().token !== expectedToken) {
    throw new Error("Protected-data migration lock changed ownership");
  }
  unlinkSync(LOCK_PATH);
}

function acquireLock(): MigrationLease {
  mkdirSync(DATA_DIR, { recursive: true });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = openSync(LOCK_PATH, "wx", 0o600);
      const record: MigrationLockRecord = {
        formatVersion: 1,
        ownerPid: process.pid,
        mode: APPLY ? "apply" : "verify",
        createdAt: new Date().toISOString(),
        token: randomUUID().replaceAll("-", ""),
      };
      try {
        writeFileSync(handle, `${JSON.stringify(record, null, 2)}\n`, "utf8");
        fsyncSync(handle);
        return { handle, record };
      } catch (error) {
        closeSync(handle);
        rmSync(LOCK_PATH, { force: true });
        throw error;
      }
    } catch (error) {
      if (errorCode(error) !== "EEXIST") throw error;
      let existing: MigrationLockRecord | null = null;
      try {
        existing = readLock();
      } catch {
        if (!RECOVER_STALE_LOCK) {
          throw new Error(
            `Migration lock ${LOCK_PATH} is malformed. After proving SahelFlow is closed, rerun with --recover-stale-lock.`,
          );
        }
        removeStaleLock(null);
        continue;
      }
      if (processIsAlive(existing.ownerPid)) {
        throw new Error(
          `Another live protected-data migration owns ${LOCK_PATH} (PID ${existing.ownerPid})`,
        );
      }
      if (!RECOVER_STALE_LOCK) {
        throw new Error(
          `Stale migration lock from dead PID ${existing.ownerPid} blocks startup. Rerun with --recover-stale-lock to resume the idempotent mixed generation.`,
        );
      }
      removeStaleLock(existing.token);
    }
  }
  throw new Error(`Could not acquire protected-data migration lock: ${LOCK_PATH}`);
}

function finishLock(lease: MigrationLease, remove: boolean): void {
  closeSync(lease.handle);
  if (!remove || !existsSync(LOCK_PATH)) return;
  try {
    if (readLock().token === lease.record.token) unlinkSync(LOCK_PATH);
  } catch {
    // An unreadable or changed lease remains as a fail-closed startup barrier.
  }
}

function fsyncDirectory(path: string): void {
  if (process.platform === "win32") return;
  const handle = openSync(path, "r");
  try {
    fsyncSync(handle);
  } finally {
    closeSync(handle);
  }
}

function migrationSetSha256(): string {
  const root = resolve(process.cwd(), "prisma", "migrations");
  const hash = createHash("sha256");
  for (const entry of readdirSync(root, { withFileTypes: true })
    .filter((candidate) => candidate.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name))) {
    const sqlPath = join(root, entry.name, "migration.sql");
    if (!existsSync(sqlPath)) continue;
    hash.update(entry.name, "utf8");
    hash.update("\0", "utf8");
    hash.update(readFileSync(sqlPath));
    hash.update("\0", "utf8");
  }
  return hash.digest("hex");
}

function shopContext(
  registry: ShopRegistry,
  shop: Shop,
  migrationSha: string,
): ShopContext {
  return Object.freeze({
    workspaceId: registry.workspaceId,
    installationId: registry.installationId,
    shopId: shop.id,
    shopIncarnationId: shop.incarnationId,
    registryRevision: registry.revision,
    databaseFileId: shop.databaseFile,
    migrationSetSha256: migrationSha,
  });
}

function durableCopy(source: string, target: string): void {
  mkdirSync(dirname(target), { recursive: true });
  const temporary = `${target}.${randomUUID()}.tmp`;
  copyFileSync(source, temporary);
  const handle = openSync(temporary, "r");
  try {
    fsyncSync(handle);
  } finally {
    closeSync(handle);
  }
  renameSync(temporary, target);
  fsyncDirectory(dirname(target));
}

function durableJson(path: string, value: unknown): void {
  const temporary = `${path}.${randomUUID()}.tmp`;
  const handle = openSync(temporary, "wx", 0o600);
  try {
    writeFileSync(handle, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    fsyncSync(handle);
  } finally {
    closeSync(handle);
  }
  renameSync(temporary, path);
  fsyncDirectory(dirname(path));
}

async function checkpointDatabase(path: string): Promise<void> {
  const prisma = new PrismaClient({ datasourceUrl: `file:${path}` });
  try {
    await prisma.$queryRawUnsafe("PRAGMA wal_checkpoint(TRUNCATE)");
  } finally {
    await prisma.$disconnect();
  }
}

async function createRescueSet(
  registry: ShopRegistry,
): Promise<{ directory: string; entries: RescueEntry[] }> {
  const directory = join(
    RESCUE_ROOT,
    new Date().toISOString().replaceAll(/[:.]/g, "-"),
  );
  mkdirSync(directory, { recursive: true });
  const entries: RescueEntry[] = [];
  for (const shop of registry.shops) {
    const source = databasePath(shop);
    await checkpointDatabase(source);
    const rescue = join(directory, shop.databaseFile);
    durableCopy(source, rescue);
    entries.push({ shop, source, rescue });
  }
  durableJson(join(directory, "manifest.json"), {
    formatVersion: 1,
    createdAt: new Date().toISOString(),
    workspaceId: registry.workspaceId,
    installationId: registry.installationId,
    registryRevision: registry.revision,
    shops: entries.map(({ shop, rescue }) => ({
      id: shop.id,
      incarnationId: shop.incarnationId,
      databaseFile: shop.databaseFile,
      rescueFile: basename(rescue),
    })),
  });
  return { directory, entries };
}

function restoreRescueSet(entries: RescueEntry[]): void {
  for (const entry of entries) {
    rmSync(`${entry.source}-wal`, { force: true });
    rmSync(`${entry.source}-shm`, { force: true });
    durableCopy(entry.rescue, entry.source);
    rmSync(`${entry.source}-wal`, { force: true });
    rmSync(`${entry.source}-shm`, { force: true });
  }
}

function addStats(
  aggregate: ProtectedDataMigrationStats,
  stats: ProtectedDataMigrationStats,
): void {
  for (const key of Object.keys(aggregate) as Array<
    keyof ProtectedDataMigrationStats
  >) {
    aggregate[key] += stats[key];
  }
}

function emptyStats(): ProtectedDataMigrationStats {
  return {
    customers: 0,
    orders: 0,
    conversations: 0,
    messages: 0,
    secrets: 0,
    keyAuthoritiesVerified: 0,
    keyAuthoritiesMigrated: 0,
    valuesVerified: 0,
    valuesMigrated: 0,
    indexesMigrated: 0,
  };
}

async function migrateOneShop(
  registry: ShopRegistry,
  shop: Shop,
  installationRoot: Buffer,
  migrationSha: string,
): Promise<ProtectedDataMigrationStats> {
  const prisma = new PrismaClient({
    datasourceUrl: `file:${databasePath(shop)}`,
  });
  try {
    return await migrateShopProtectedData(prisma, {
      mode: APPLY ? "apply" : "verify",
      shopContext: shopContext(registry, shop, migrationSha),
      installationRoot,
    });
  } finally {
    await prisma.$disconnect();
  }
}

async function main(): Promise<void> {
  if (APPLY && VERIFY) {
    throw new Error("Choose exactly one of --verify or --apply");
  }
  assertRuntimeStopped();
  const lease = acquireLock();
  const installationRoot = getMasterKey();
  let rescue: Awaited<ReturnType<typeof createRescueSet>> | null = null;
  let retainLock = false;
  try {
    const registry = parseRegistry();
    if (registry.shops.length === 0) {
      throw new Error("The shop registry contains no databases to migrate");
    }
    const migrationSha = migrationSetSha256();
    if (APPLY) rescue = await createRescueSet(registry);

    const aggregate = emptyStats();
    const perShop: Record<string, ProtectedDataMigrationStats> = {};
    for (const shop of registry.shops) {
      const stats = await migrateOneShop(
        registry,
        shop,
        installationRoot,
        migrationSha,
      );
      perShop[shop.id] = stats;
      addStats(aggregate, stats);
    }

    console.log(
      JSON.stringify(
        {
          mode: APPLY ? "apply" : "verify",
          registryRevision: registry.revision,
          rescueDirectory: rescue?.directory ?? null,
          aggregate,
          shops: perShop,
        },
        null,
        2,
      ),
    );

    if (
      !APPLY &&
      aggregate.keyAuthoritiesMigrated +
        aggregate.valuesMigrated +
        aggregate.indexesMigrated >
        0
    ) {
      process.exitCode = 2;
    }
  } catch (error) {
    if (APPLY && rescue) {
      try {
        restoreRescueSet(rescue.entries);
      } catch (restoreError) {
        retainLock = true;
        throw new AggregateError(
          [error, restoreError],
          "Protected-data migration failed and rescue restoration also failed",
        );
      }
    }
    throw error;
  } finally {
    installationRoot.fill(0);
    finishLock(lease, !retainLock);
  }
}

main().catch((error) => {
  console.error(
    `Protected-data migration failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}`,
  );
  if (existsSync(LOCK_PATH)) {
    console.error(
      `Maintenance lock retained at ${LOCK_PATH}; rerun with --recover-stale-lock only after proving SahelFlow is closed.`,
    );
  }
  process.exit(1);
});
