import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
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
import { basename, join, resolve } from "node:path";

import { PrismaClient } from "@prisma/client";

import type { BackupEntry, RestorePreparationResult } from "../index";
import { SahelFlowError } from "@/types/errors";

const BACKUP_FILENAME_RE =
  /^sahelflow-backup-([a-z0-9][a-z0-9-]*)-([0-9TZ-]+)\.db$/;

interface TestBackupManifest {
  formatVersion: 1;
  filename: string;
  createdAt: string;
  size: number;
  sha256: string;
}

function databasePath(): string {
  const url = process.env.DATABASE_URL;
  if (!url?.startsWith("file:")) {
    throw new Error("The test backup harness requires a file: DATABASE_URL");
  }
  return resolve(url.slice("file:".length));
}

function testShopId(): string {
  const value = (process.env.SF_ACTIVE_SHOP_ID ?? "test").toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(value)) {
    throw new Error("The test backup harness requires a canonical shop ID");
  }
  return value;
}

function backupsDir(): string {
  const dataDir = process.env.SF_DATA_DIR;
  if (!dataDir) throw new Error("The test backup harness requires SF_DATA_DIR");
  return join(dataDir, "backups");
}

function manifestPath(path: string): string {
  return `${path}.manifest.json`;
}

async function digest(path: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolveDigest, reject) => {
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolveDigest);
  });
  return hash.digest("hex");
}

async function verifySqlite(path: string): Promise<void> {
  const verifier = new PrismaClient({ datasourceUrl: `file:${path}` });
  try {
    const integrity = await verifier.$queryRawUnsafe<
      Array<Record<string, string>>
    >("PRAGMA integrity_check");
    if (Object.values(integrity[0] ?? {})[0] !== "ok") {
      throw new Error("The test backup failed SQLite integrity verification");
    }
    const foreignKeys = await verifier.$queryRawUnsafe<
      Array<Record<string, unknown>>
    >("PRAGMA foreign_key_check");
    if (foreignKeys.length > 0) {
      throw new Error("The test backup failed SQLite foreign-key verification");
    }
  } finally {
    await verifier.$disconnect();
  }
}

async function checkpoint(path: string): Promise<void> {
  const client = new PrismaClient({ datasourceUrl: `file:${path}` });
  try {
    await client.$executeRawUnsafe("PRAGMA wal_checkpoint(TRUNCATE)");
  } finally {
    await client.$disconnect();
  }
}

async function writeManifest(path: string, manifest: TestBackupManifest) {
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

async function readManifest(path: string): Promise<TestBackupManifest> {
  const manifest = JSON.parse(
    await readFile(path, "utf8"),
  ) as TestBackupManifest;
  if (
    manifest.formatVersion !== 1 ||
    !BACKUP_FILENAME_RE.test(manifest.filename) ||
    !/^[0-9a-f]{64}$/.test(manifest.sha256)
  ) {
    throw new Error("The test backup manifest is invalid");
  }
  return manifest;
}

function combinedEntry(manifest: TestBackupManifest, path: string): BackupEntry {
  const createdAtUnixMs = Date.parse(manifest.createdAt);
  const shopId = testShopId();
  return {
    backupId: manifest.filename,
    createdAtUnixMs,
    verifiedAtUnixMs: createdAtUnixMs,
    retentionClass: "test-only",
    pinned: false,
    workspaceId: "test",
    sourceInstallationId: "test",
    shopCount: 1,
    plaintextBytes: manifest.size,
    containerBytes: manifest.size,
    status: "verified",
    location: path,
    requiresRecoveryKit: false,
    independentRecoveryReady: true,
    filename: manifest.filename,
    size: manifest.size,
    createdAt: manifest.createdAt,
    shopId,
    sha256: manifest.sha256,
  };
}

export function validateBackupFilename(filename: string): string {
  if (
    !filename ||
    basename(filename) !== filename ||
    !BACKUP_FILENAME_RE.test(filename)
  ) {
    throw new SahelFlowError(
      "Invalid test backup filename",
      "VALIDATION",
      400,
    );
  }
  return filename;
}

export async function createBackup(): Promise<BackupEntry> {
  const source = databasePath();
  const directory = backupsDir();
  await mkdir(directory, { recursive: true });
  await checkpoint(source);
  const filename = `sahelflow-backup-${testShopId()}-${new Date()
    .toISOString()
    .replace(/[:.]/g, "-")}.db`;
  const target = join(directory, filename);
  const staged = `${target}.${randomUUID()}.tmp`;
  await copyFile(source, staged);
  await verifySqlite(staged);
  const size = (await stat(staged)).size;
  const sha256 = await digest(staged);
  await rename(staged, target);
  const manifest: TestBackupManifest = {
    formatVersion: 1,
    filename,
    createdAt: new Date().toISOString(),
    size,
    sha256,
  };
  await writeManifest(manifestPath(target), manifest);
  return combinedEntry(manifest, target);
}

export async function listBackups(): Promise<BackupEntry[]> {
  const directory = backupsDir();
  await mkdir(directory, { recursive: true });
  const results: BackupEntry[] = [];
  for (const filename of await readdir(directory)) {
    if (!BACKUP_FILENAME_RE.test(filename)) continue;
    const path = join(directory, filename);
    try {
      results.push(
        combinedEntry(await readManifest(manifestPath(path)), path),
      );
    } catch {
      // Invalid test artifacts are not offered as restore points.
    }
  }
  return results.sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
}

export async function restoreBackup(
  filename: string,
): Promise<RestorePreparationResult> {
  if (process.env.NODE_ENV === "production") {
    throw new SahelFlowError(
      "Live replacement restore requires the desktop supervisor",
      "BACKUP_RESTORE_SUPERVISOR_REQUIRED",
      503,
    );
  }
  const safe = validateBackupFilename(filename);
  const source = join(backupsDir(), safe);
  const manifest = await readManifest(manifestPath(source));
  if ((await digest(source)) !== manifest.sha256) {
    throw new Error("The test backup digest does not match its manifest");
  }
  const target = databasePath();
  const staged = `${target}.${randomUUID()}.restore-staged`;
  const displaced = `${target}.${randomUUID()}.displaced`;
  const recoveryDir = join(backupsDir(), "recovery");
  await mkdir(recoveryDir, { recursive: true });
  const rescueFile = `${testShopId()}-${Date.now()}-pre-restore.db`;
  await copyFile(source, staged);
  await verifySqlite(staged);
  const { disconnectAllShops } = await import("@/lib/db");
  await disconnectAllShops();
  await copyFile(target, join(recoveryDir, rescueFile));
  let displacedReady = false;
  try {
    await rename(target, displaced);
    displacedReady = true;
    await rename(staged, target);
    await verifySqlite(target);
    await rm(displaced, { force: true });
  } catch (error) {
    if (displacedReady) {
      await rm(target, { force: true });
      await rename(displaced, target).catch(() => undefined);
    }
    await rm(staged, { force: true });
    throw error;
  }
  return {
    backupId: safe,
    restoreId: rescueFile,
    sourceWorkspaceId: "test",
    sourceShopCount: 1,
    restartRequired: true,
    success: true,
    relaunchRequired: true,
    rescueFile,
  };
}

export async function deleteBackup(
  filename: string,
): Promise<{ deleted: true; success: true }> {
  const safe = validateBackupFilename(filename);
  const path = join(backupsDir(), safe);
  await rm(path);
  await rm(manifestPath(path), { force: true });
  return { deleted: true, success: true };
}
