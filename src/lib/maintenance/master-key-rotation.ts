import "server-only";

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { dataRoot } from "@/lib/storage/data-root";
import { SahelFlowError } from "@/types/errors";

export const MASTER_KEY_ROTATION_LOCK_FILE = "master-key-rotation.lock";
export const MASTER_KEY_ROTATION_SIDECAR_FILE = "master.key.new";
export const MASTER_KEY_ROTATION_LOCK_FORMAT_VERSION = 1;

export interface MasterKeyRotationLockRecord {
  formatVersion: 1;
  ownerPid: number;
  token: string;
  createdAt: string;
}

export function masterKeyRotationLockPath(): string {
  return join(dataRoot(), MASTER_KEY_ROTATION_LOCK_FILE);
}

export function masterKeyRotationSidecarPath(): string {
  return join(dataRoot(), MASTER_KEY_ROTATION_SIDECAR_FILE);
}

export function parseMasterKeyRotationLock(
  value: unknown,
): MasterKeyRotationLockRecord {
  if (!value || typeof value !== "object") {
    throw new Error("Master-key rotation lock is not an object");
  }
  const record = value as Partial<MasterKeyRotationLockRecord>;
  if (
    record.formatVersion !== MASTER_KEY_ROTATION_LOCK_FORMAT_VERSION ||
    !Number.isSafeInteger(record.ownerPid) ||
    (record.ownerPid ?? 0) <= 0 ||
    typeof record.token !== "string" ||
    !/^[0-9a-f]{32}$/i.test(record.token) ||
    typeof record.createdAt !== "string" ||
    Number.isNaN(Date.parse(record.createdAt))
  ) {
    throw new Error("Master-key rotation lock is malformed");
  }
  return {
    formatVersion: MASTER_KEY_ROTATION_LOCK_FORMAT_VERSION,
    ownerPid: record.ownerPid!,
    token: record.token,
    createdAt: record.createdAt,
  };
}

/**
 * Fail closed while the installation-wide master key is being rotated.
 *
 * The rotation script owns a maintenance lease before it inspects any shop
 * database. It also durably publishes `master.key.new` before entering the
 * mutation window. Startup and production writes therefore observe either the
 * lease or the sidecar: even if a power loss drops the newly-created lease
 * directory entry, the fsynced sidecar remains a durable recovery barrier until
 * the rotation commits the shared keyfile and removes it.
 */
export function assertMasterKeyRotationInactive(): void {
  const lockPath = masterKeyRotationLockPath();
  const sidecarPath = masterKeyRotationSidecarPath();
  const lockExists = existsSync(lockPath);
  const sidecarExists = existsSync(sidecarPath);
  if (!lockExists && !sidecarExists) return;

  let detail = sidecarExists
    ? "durable pending-key recovery sidecar"
    : "unknown owner";
  if (lockExists) {
    try {
      const record = parseMasterKeyRotationLock(
        JSON.parse(readFileSync(lockPath, "utf8")),
      );
      detail = `PID ${record.ownerPid}, started ${record.createdAt}`;
    } catch {
      detail = "malformed maintenance lease";
    }
  }

  throw new SahelFlowError(
    `Master-key rotation is in progress (${detail}); keep SahelFlow closed until the rotation finishes`,
    "MASTER_KEY_ROTATION_IN_PROGRESS",
    503,
  );
}
