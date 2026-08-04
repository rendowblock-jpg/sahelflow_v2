import "server-only";

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { dataRoot } from "@/lib/storage/data-root";
import { SahelFlowError } from "@/types/errors";

export const PROTECTED_DATA_MIGRATION_LOCK_FILE =
  "protected-data-migration-v1.lock";

interface ProtectedDataMigrationLockRecord {
  formatVersion: 1;
  ownerPid: number;
  mode: "verify" | "apply";
  createdAt: string;
  token: string;
}

export function protectedDataMigrationLockPath(): string {
  return join(dataRoot(), PROTECTED_DATA_MIGRATION_LOCK_FILE);
}

function parseLock(value: unknown): ProtectedDataMigrationLockRecord {
  if (!value || typeof value !== "object") {
    throw new Error("Protected-data migration lock is not an object");
  }
  const record = value as Partial<ProtectedDataMigrationLockRecord>;
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
  return record as ProtectedDataMigrationLockRecord;
}

/** Fail closed while any shop may contain a mixed protected-data generation. */
export function assertProtectedDataMigrationInactive(): void {
  const path = protectedDataMigrationLockPath();
  if (!existsSync(path)) return;

  let detail = "malformed maintenance lease";
  try {
    const record = parseLock(JSON.parse(readFileSync(path, "utf8")));
    detail = `${record.mode} PID ${record.ownerPid}, started ${record.createdAt}`;
  } catch {
    // The existence of an unreadable lock is itself a fail-closed barrier.
  }

  throw new SahelFlowError(
    `Protected-data migration is active (${detail}); keep SahelFlow closed until it completes or recovery restores the previous generation`,
    "PROTECTED_DATA_MIGRATION_IN_PROGRESS",
    503,
  );
}
