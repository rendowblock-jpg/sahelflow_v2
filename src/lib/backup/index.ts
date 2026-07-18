import "server-only";

import { PrismaClient } from "@prisma/client";
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { basename, join } from "node:path";
import { db, disconnectAllShops, shopContext } from "@/lib/db";
import {
  getRegistry,
  getShop,
  getShopDatabasePath,
} from "@/lib/shops";
import { dataRoot } from "@/lib/storage/data-root";
import { SahelFlowError } from "@/types/errors";

const BACKUP_FORMAT_VERSION = 1;
export const backupsDir = join(dataRoot(), "backups");
const BACKUP_FILENAME_RE = /^sahelflow-backup-([a-z0-9][a-z0-9-]*)-([0-9TZ-]+)\.db$/;

type BackupManifest = {
  formatVersion: 1;
  installationId: string;
  shopId: string;
  registryRevision: number;
  databaseFile: string;
  migrationSetSha256: string;
  createdAt: string;
  size: number;
  sha256: string;
  integrity: "ok";
};

export interface BackupEntry {
  filename: string;
  size: number;
  createdAt: string;
  shopId: string;
  sha256: string;
}

function manifestPath(databaseBackupPath: string): string {
  return `${databaseBackupPath}.manifest.json`;
}

async function sha256(path: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

async function verifySqlite(path: string): Promise<void> {
  const verifier = new PrismaClient({ datasourceUrl: `file:${path}` });
  try {
    const integrity = await verifier.$queryRawUnsafe<Array<Record<string, string>>>(
      "PRAGMA integrity_check",
    );
    const result = Object.values(integrity[0] ?? {})[0];
    if (result !== "ok") {
      throw new Error(`SQLite integrity check returned ${result ?? "no result"}`);
    }
    const foreignKeys = await verifier.$queryRawUnsafe<Array<Record<string, unknown>>>(
      "PRAGMA foreign_key_check",
    );
    if (foreignKeys.length > 0) {
      throw new Error("SQLite foreign key check failed");
    }
  } finally {
    await verifier.$disconnect();
  }
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  await rm(path, { force: true });
  await rename(temporary, path);
}

function activeShopPath(): string {
  const registry = getRegistry();
  const shop = getShop(shopContext.shopId);
  if (
    registry.revision !== shopContext.registryRevision ||
    !shop ||
    shop.databaseFile !== shopContext.databaseFileId
  ) {
    throw new SahelFlowError(
      "The active process ShopContext no longer matches the registry",
      "SHOP_CONTEXT_STALE",
      409,
    );
  }
  return getShopDatabasePath(shop);
}

export function getActiveDbPath(): string {
  return activeShopPath();
}

export function validateBackupFilename(filename: string): string {
  if (!filename || basename(filename) !== filename || !BACKUP_FILENAME_RE.test(filename)) {
    throw new SahelFlowError("Invalid backup filename", "VALIDATION", 400);
  }
  return filename;
}

async function readManifest(path: string): Promise<BackupManifest> {
  let manifest: BackupManifest;
  try {
    manifest = JSON.parse(await readFile(path, "utf8")) as BackupManifest;
  } catch {
    throw new SahelFlowError("Backup manifest is missing or corrupt", "BACKUP_MANIFEST_INVALID", 409);
  }
  if (
    manifest.formatVersion !== BACKUP_FORMAT_VERSION ||
    manifest.integrity !== "ok" ||
    !/^[0-9a-f]{64}$/i.test(manifest.sha256) ||
    !/^[0-9a-f]{64}$/i.test(manifest.migrationSetSha256)
  ) {
    throw new SahelFlowError("Backup manifest is invalid", "BACKUP_MANIFEST_INVALID", 409);
  }
  return manifest;
}

export async function createBackup(): Promise<BackupEntry> {
  await mkdir(backupsDir, { recursive: true });
  const databasePath = activeShopPath();
  await db.$queryRawUnsafe("PRAGMA wal_checkpoint(TRUNCATE)");

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `sahelflow-backup-${shopContext.shopId}-${timestamp}.db`;
  const finalPath = join(backupsDir, filename);
  const stagedPath = `${finalPath}.${randomUUID()}.tmp`;
  await copyFile(databasePath, stagedPath);
  await verifySqlite(stagedPath);
  const size = (await stat(stagedPath)).size;
  const digest = await sha256(stagedPath);
  await rename(stagedPath, finalPath);

  const registry = getRegistry();
  const manifest: BackupManifest = {
    formatVersion: BACKUP_FORMAT_VERSION,
    installationId: registry.installationId,
    shopId: shopContext.shopId,
    registryRevision: shopContext.registryRevision,
    databaseFile: shopContext.databaseFileId,
    migrationSetSha256: shopContext.migrationSetSha256,
    createdAt: new Date().toISOString(),
    size,
    sha256: digest,
    integrity: "ok",
  };
  await writeJsonAtomic(manifestPath(finalPath), manifest);
  return {
    filename,
    size,
    createdAt: manifest.createdAt,
    shopId: manifest.shopId,
    sha256: manifest.sha256,
  };
}

export async function listBackups(): Promise<BackupEntry[]> {
  await mkdir(backupsDir, { recursive: true });
  const entries = await readdir(backupsDir);
  const backups: BackupEntry[] = [];
  for (const filename of entries) {
    if (!BACKUP_FILENAME_RE.test(filename)) continue;
    const path = join(backupsDir, filename);
    try {
      const manifest = await readManifest(manifestPath(path));
      if (manifest.shopId !== shopContext.shopId) continue;
      backups.push({
        filename,
        size: manifest.size,
        createdAt: manifest.createdAt,
        shopId: manifest.shopId,
        sha256: manifest.sha256,
      });
    } catch {
      // Corrupt entries are not offered as restore points.
    }
  }
  return backups.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function restoreBackup(
  filename: string,
): Promise<{ success: true; relaunchRequired: true; rescueFile: string }> {
  const safe = validateBackupFilename(filename);
  const backupPath = join(backupsDir, safe);
  const manifest = await readManifest(manifestPath(backupPath));
  const registry = getRegistry();
  if (
    manifest.installationId !== registry.installationId ||
    manifest.shopId !== shopContext.shopId ||
    manifest.databaseFile !== shopContext.databaseFileId ||
    manifest.migrationSetSha256 !== shopContext.migrationSetSha256
  ) {
    throw new SahelFlowError(
      "Backup does not belong to the active installation, shop, or schema",
      "BACKUP_CONTEXT_MISMATCH",
      409,
    );
  }
  if ((await sha256(backupPath)) !== manifest.sha256) {
    throw new SahelFlowError("Backup hash verification failed", "BACKUP_HASH_MISMATCH", 409);
  }

  const databasePath = activeShopPath();
  const stagedRestore = `${databasePath}.${randomUUID()}.restore-staged`;
  await copyFile(backupPath, stagedRestore);
  await verifySqlite(stagedRestore);
  await db.$queryRawUnsafe("PRAGMA wal_checkpoint(TRUNCATE)");
  await disconnectAllShops();

  const recoveryDir = join(backupsDir, "recovery");
  await mkdir(recoveryDir, { recursive: true });
  const rescueFile = `${shopContext.shopId}-${Date.now()}-pre-restore.db`;
  const rescuePath = join(recoveryDir, rescueFile);
  await copyFile(databasePath, rescuePath);
  await verifySqlite(rescuePath);

  const displaced = `${databasePath}.${randomUUID()}.displaced`;
  let displacedReady = false;
  try {
    await rename(databasePath, displaced);
    displacedReady = true;
    await rename(stagedRestore, databasePath);
    await verifySqlite(databasePath);
    await rm(displaced, { force: true });
  } catch (error) {
    if (displacedReady) {
      await rm(databasePath, { force: true });
      await rename(displaced, databasePath).catch(() => undefined);
    }
    await rm(stagedRestore, { force: true });
    throw error;
  }

  await writeJsonAtomic(`${rescuePath}.json`, {
    formatVersion: 1,
    state: "restore-complete",
    shopId: shopContext.shopId,
    restoredFrom: safe,
    rescueFile,
    completedAt: new Date().toISOString(),
  });
  return { success: true, relaunchRequired: true, rescueFile };
}

export async function deleteBackup(filename: string): Promise<{ success: true }> {
  const safe = validateBackupFilename(filename);
  const path = join(backupsDir, safe);
  const manifest = await readManifest(manifestPath(path));
  if (manifest.shopId !== shopContext.shopId) {
    throw new SahelFlowError("Backup belongs to another shop", "BACKUP_CONTEXT_MISMATCH", 409);
  }
  await rm(path);
  await rm(manifestPath(path), { force: true });
  return { success: true };
}
