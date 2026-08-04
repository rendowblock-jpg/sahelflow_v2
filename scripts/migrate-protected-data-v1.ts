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
  writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";

import { getMasterKey } from "@/lib/crypto/master-key";
import {
  migrateShopProtectedData,
  type ProtectedDataMigrationStats,
} from "@/lib/maintenance/protected-data-migration";
import {
  getRegistry,
  getShopDatabasePath,
  type Shop,
  type ShopRegistry,
} from "@/lib/shops";
import type { ShopContext } from "@/lib/shops/context";

const APPLY = process.argv.includes("--apply");
const VERIFY = process.argv.includes("--verify") || !APPLY;
const DATA_DIR = process.env.SF_DATA_DIR
  ? resolve(process.env.SF_DATA_DIR)
  : resolve(process.cwd(), "data");
const LOCK_PATH = join(DATA_DIR, "protected-data-migration-v1.lock");
const RUNTIME_MANIFEST_PATH = join(DATA_DIR, "runtime-endpoint.json");
const RESCUE_ROOT = join(DATA_DIR, "migration-rescue", "protected-data-v1");

interface RuntimeManifest {
  processId?: unknown;
  state?: unknown;
}

interface RescueEntry {
  shop: Shop;
  source: string;
  rescue: string;
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code)
        : "";
    return code !== "ESRCH";
  }
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

function acquireLock(): number {
  mkdirSync(DATA_DIR, { recursive: true });
  const handle = openSync(LOCK_PATH, "wx", 0o600);
  const record = {
    formatVersion: 1,
    ownerPid: process.pid,
    mode: APPLY ? "apply" : "verify",
    createdAt: new Date().toISOString(),
    token: randomUUID().replaceAll("-", ""),
  };
  writeFileSync(handle, `${JSON.stringify(record)}\n`, "utf8");
  fsyncSync(handle);
  return handle;
}

function releaseLock(handle: number): void {
  closeSync(handle);
  rmSync(LOCK_PATH, { force: true });
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
  mkdirSync(resolve(target, ".."), { recursive: true });
  const temporary = `${target}.${randomUUID()}.tmp`;
  copyFileSync(source, temporary);
  const handle = openSync(temporary, "r");
  try {
    fsyncSync(handle);
  } finally {
    closeSync(handle);
  }
  renameSync(temporary, target);
}

async function checkpointDatabase(databasePath: string): Promise<void> {
  const prisma = new PrismaClient({ datasourceUrl: `file:${databasePath}` });
  try {
    await prisma.$executeRawUnsafe("PRAGMA wal_checkpoint(TRUNCATE)");
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
    const source = getShopDatabasePath(shop);
    await checkpointDatabase(source);
    const rescue = join(directory, basename(source));
    durableCopy(source, rescue);
    entries.push({ shop, source, rescue });
  }
  const manifest = {
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
  };
  writeFileSync(
    join(directory, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { mode: 0o600 },
  );
  return { directory, entries };
}

function restoreRescueSet(entries: RescueEntry[]): void {
  for (const entry of entries) durableCopy(entry.rescue, entry.source);
}

function addStats(
  aggregate: ProtectedDataMigrationStats,
  stats: ProtectedDataMigrationStats,
): void {
  for (const key of Object.keys(aggregate) as Array<keyof ProtectedDataMigrationStats>) {
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
  const databasePath = getShopDatabasePath(shop);
  const prisma = new PrismaClient({ datasourceUrl: `file:${databasePath}` });
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
  const lock = acquireLock();
  const installationRoot = getMasterKey();
  let rescue: Awaited<ReturnType<typeof createRescueSet>> | null = null;
  try {
    const registry = getRegistry();
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

    if (!APPLY && aggregate.valuesMigrated + aggregate.indexesMigrated > 0) {
      process.exitCode = 2;
    }
  } catch (error) {
    if (APPLY && rescue) {
      try {
        restoreRescueSet(rescue.entries);
      } catch (restoreError) {
        throw new AggregateError(
          [error, restoreError],
          "Protected-data migration failed and rescue restoration also failed",
        );
      }
    }
    throw error;
  } finally {
    installationRoot.fill(0);
    releaseLock(lock);
  }
}

main().catch((error) => {
  console.error(
    `Protected-data migration failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}`,
  );
  process.exit(1);
});
