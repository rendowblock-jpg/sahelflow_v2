/**
 * Full-database backup / restore for the local-first SQLite store.
 *
 * ARCHITECTURE
 * ────────────
 * The app uses one SQLite file per shop (data/shops/*.db), with the active
 * shop tracked in data/app-meta.json. Backups are byte-for-byte copies of
 * the active shop's .db file stored under data/backups/. Restore copies a
 * backup back over the active .db file (destructive — overwrites current
 * data). All operations require authentication at the route layer.
 *
 * WAL SAFETY
 * ─────────
 * Prisma's SQLite driver uses WAL mode by default — committed transactions
 * may sit in the -wal sidecar until checkpointed. Before each backup we run
 * `PRAGMA wal_checkpoint(TRUNCATE)` so the .db file alone contains all
 * committed data. (The -wal file is not copied.)
 *
 * CONNECTION SAFETY ON RESTORE
 * ────────────────────────────
 * We disconnect every shop client (and the raw fallback client) before
 * overwriting the file, so no open file handle holds a stale inode. The
 * next request re-establishes the connection lazily through the existing
 * Proxy cache.
 */
import "server-only";

import { copyFile, mkdir, readdir, stat, unlink } from "fs/promises";
import { existsSync, readFileSync } from "fs";
import { basename, join, resolve } from "path";
import { db, disconnectAllShops } from "@/lib/db";
import { SahelFlowError } from "@/types/errors";

/** Directory where backup .db files are stored. */
export const backupsDir = join(process.cwd(), "data", "backups");

/** Filename pattern: sahelflow-backup-<iso-timestamp-with-dashes>.db */
const BACKUP_FILENAME_RE = /^sahelflow-backup-[0-9TZ-]+\.db$/;

/** Ensure the backups directory exists. */
async function ensureBackupsDir(): Promise<void> {
  await mkdir(backupsDir, { recursive: true });
}

/**
 * Resolve the absolute path to the active shop's SQLite file.
 * Falls back to data/shops/dev.db (the default shop) when the registry
 * is missing or no shop is active.
 */
export function getActiveDbPath(): string {
  try {
    const metaPath = join(process.cwd(), "data", "app-meta.json");
    if (existsSync(metaPath)) {
      const meta = JSON.parse(readFileSync(metaPath, "utf-8")) as {
        shops?: Array<{ id: string; dbPath: string }>;
        activeShopId?: string | null;
      };
      const activeId = meta.activeShopId;
      const shop = activeId
        ? meta.shops?.find((s) => s.id === activeId)
        : undefined;
      if (shop?.dbPath) {
        const resolved = resolve(process.cwd(), shop.dbPath);
        if (existsSync(resolved)) return resolved;
        // Fall through to DATABASE_URL if the file doesn't exist
      }
    }
  } catch {
    // ignore — fall through to fallback
  }
  // Fallback: use DATABASE_URL (test/CI environment where app-meta.json
  // may point to a non-existent path)
  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl?.startsWith("file:")) {
    const path = dbUrl.slice("file:".length);
    if (existsSync(path)) return resolve(path);
  }
  return join(process.cwd(), "data", "shops", "dev.db");
}

/**
 * Reject anything that isn't a single .db filename matching our naming
 * convention. Prevents path traversal (../) and arbitrary writes.
 * Returns the safe basename.
 */
export function validateBackupFilename(filename: string): string {
  if (!filename || typeof filename !== "string") {
    throw new SahelFlowError("Filename required", "VALIDATION", 400);
  }
  const safe = basename(filename);
  if (safe !== filename) {
    throw new SahelFlowError("Invalid backup filename", "VALIDATION", 400);
  }
  if (safe.includes("..") || safe.includes("/") || safe.includes("\\")) {
    throw new SahelFlowError("Invalid backup filename", "VALIDATION", 400);
  }
  if (!BACKUP_FILENAME_RE.test(safe)) {
    throw new SahelFlowError(
      "Backup filename does not match expected pattern",
      "VALIDATION",
      400,
    );
  }
  return safe;
}

export interface BackupEntry {
  filename: string;
  size: number;
  /** ISO timestamp from the file's mtime. */
  createdAt: string;
}

/**
 * Create a timestamped backup of the active shop's SQLite file.
 * Returns the new filename + size in bytes.
 */
export async function createBackup(): Promise<{
  filename: string;
  size: number;
}> {
  await ensureBackupsDir();
  const dbPath = getActiveDbPath();

  if (!existsSync(dbPath)) {
    throw new SahelFlowError(
      "Database file not found — nothing to back up",
      "NOT_FOUND",
      404,
    );
  }

  // Force WAL checkpoint so all committed data is in the main .db file.
  // Best-effort: proceed with the copy even if the checkpoint fails.
  try {
    await db.$queryRawUnsafe("PRAGMA wal_checkpoint(TRUNCATE)").catch(() => {}); // PRAGMA returns results — use queryRaw + tolerate error
  } catch {
    /* ignore — copy will still capture the main .db file */
  }

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `sahelflow-backup-${ts}.db`;
  const backupPath = join(backupsDir, filename);

  await copyFile(dbPath, backupPath);
  const size = (await stat(backupPath)).size;

  return { filename, size };
}

/**
 * List all backup files, newest first.
 * Returns an empty array if the backups directory does not exist yet.
 */
export async function listBackups(): Promise<BackupEntry[]> {
  if (!existsSync(backupsDir)) return [];

  const entries = await readdir(backupsDir);
  const backups: BackupEntry[] = [];

  for (const filename of entries) {
    if (!BACKUP_FILENAME_RE.test(filename)) continue;
    try {
      const filePath = join(backupsDir, filename);
      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) continue;
      backups.push({
        filename,
        size: fileStat.size,
        createdAt: fileStat.mtime.toISOString(),
      });
    } catch {
      // skip unreadable files
    }
  }

  backups.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return backups;
}

/**
 * Restore a backup file by copying it over the active shop's DB file.
 *
 * DANGEROUS — overwrites all current data with the backup's snapshot.
 * Disconnects every shop client first so no stale file handle remains.
 * The next request re-establishes the connection lazily.
 */
export async function restoreBackup(
  filename: string,
): Promise<{ success: true }> {
  const safe = validateBackupFilename(filename);
  const backupPath = join(backupsDir, safe);

  if (!existsSync(backupPath)) {
    throw new SahelFlowError("Backup file not found", "NOT_FOUND", 404);
  }

  const dbPath = getActiveDbPath();

  // Disconnect Prisma so it releases file handles before we overwrite.
  // The next request re-establishes the connection automatically.
  try {
    await disconnectAllShops();
  } catch {
    /* best-effort */
  }

  // Ensure the parent directory exists (in case the .db was deleted).
  await mkdir(resolve(dbPath, ".."), { recursive: true });
  await copyFile(backupPath, dbPath);

  return { success: true as const };
}

/** Permanently delete a backup file. */
export async function deleteBackup(
  filename: string,
): Promise<{ success: true }> {
  const safe = validateBackupFilename(filename);
  const backupPath = join(backupsDir, safe);

  if (!existsSync(backupPath)) {
    throw new SahelFlowError("Backup file not found", "NOT_FOUND", 404);
  }

  await unlink(backupPath);
  return { success: true as const };
}
