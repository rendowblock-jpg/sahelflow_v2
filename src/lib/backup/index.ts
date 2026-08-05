import "server-only";

import {
  invokeNativeSurvivability,
  SURVIVABILITY_OPERATIONS,
} from "@/lib/survivability/native-bridge";
import { SahelFlowError } from "@/types/errors";

const LEGACY_TEST_BACKUP_RE =
  /^sahelflow-backup-([a-z0-9][a-z0-9-]*)-([0-9TZ-]+)\.db$/;
const NATIVE_BACKUP_ID_RE = /^backup-[0-9]{10,17}-[0-9a-f]{16}$/;

export interface BackupEntry {
  backupId: string;
  createdAtUnixMs: number;
  verifiedAtUnixMs: number;
  retentionClass: string;
  pinned: boolean;
  workspaceId: string;
  sourceInstallationId: string;
  shopCount: number;
  plaintextBytes: number;
  containerBytes: number;
  status: "verified" | "available" | "recovery-kit-required" | "corrupt";
  location: string;
  requiresRecoveryKit: boolean;
  independentRecoveryReady: boolean;

  /** @deprecated Test-only Phase 1 preservation alias. */
  filename: string;
  /** @deprecated Test-only Phase 1 preservation alias. */
  size: number;
  /** @deprecated Test-only Phase 1 preservation alias. */
  createdAt: string;
  /** @deprecated Test-only Phase 1 preservation alias. */
  shopId: string;
  /** @deprecated Test-only Phase 1 preservation alias. */
  sha256: string;
}

export interface RecoveryKitResult {
  kitId: string;
  path: string;
  recoveryCode: string;
  workspaceId: string;
  brkId: string;
  createdAtUnixMs: number;
}

export interface RestorePreparationResult {
  backupId: string;
  restoreId: string;
  sourceWorkspaceId: string;
  sourceShopCount: number;
  restartRequired: boolean;

  /** @deprecated Test-only Phase 1 preservation alias. */
  success: true;
  /** @deprecated Test-only Phase 1 preservation alias. */
  relaunchRequired: true;
  /** @deprecated Test-only Phase 1 preservation alias. */
  rescueFile: string;
}

function testHarnessEnabled(): boolean {
  return process.env.NODE_ENV === "test" || process.env.VITEST === "true";
}

async function testHarness() {
  if (!testHarnessEnabled()) {
    throw new SahelFlowError(
      "The test backup harness is unavailable outside the test process",
      "BACKUP_TEST_HARNESS_UNAVAILABLE",
      500,
    );
  }
  return import("./__tests__/test-backup-harness");
}

function normalizeNativeBackup(
  entry: Omit<
    BackupEntry,
    "filename" | "size" | "createdAt" | "shopId" | "sha256"
  >,
): BackupEntry {
  return {
    ...entry,
    filename: entry.backupId,
    size: entry.containerBytes,
    createdAt: new Date(entry.createdAtUnixMs).toISOString(),
    shopId: entry.workspaceId,
    sha256: "",
  };
}

export function validateBackupFilename(value: string): string {
  if (
    !value ||
    value.includes("/") ||
    value.includes("\\") ||
    (!LEGACY_TEST_BACKUP_RE.test(value) && !NATIVE_BACKUP_ID_RE.test(value))
  ) {
    throw new SahelFlowError("Invalid backup identity", "VALIDATION", 400);
  }
  return value;
}

export async function createBackup(): Promise<BackupEntry> {
  if (testHarnessEnabled()) return (await testHarness()).createBackup();
  const entry = await invokeNativeSurvivability<
    Omit<BackupEntry, "filename" | "size" | "createdAt" | "shopId" | "sha256">
  >(SURVIVABILITY_OPERATIONS.createBackup);
  return normalizeNativeBackup(entry);
}

export async function listBackups(): Promise<BackupEntry[]> {
  if (testHarnessEnabled()) return (await testHarness()).listBackups();
  const entries = await invokeNativeSurvivability<
    Array<
      Omit<BackupEntry, "filename" | "size" | "createdAt" | "shopId" | "sha256">
    >
  >(SURVIVABILITY_OPERATIONS.listBackups);
  return entries.map(normalizeNativeBackup);
}

export async function createRecoveryKit(): Promise<RecoveryKitResult> {
  return invokeNativeSurvivability<RecoveryKitResult>(
    SURVIVABILITY_OPERATIONS.createRecoveryKit,
  );
}

export async function restoreBackup(
  backupId: string,
  recoveryCode?: string,
): Promise<RestorePreparationResult> {
  if (testHarnessEnabled()) {
    return (await testHarness()).restoreBackup(backupId);
  }
  const result = await invokeNativeSurvivability<
    Omit<RestorePreparationResult, "success" | "relaunchRequired" | "rescueFile">
  >(SURVIVABILITY_OPERATIONS.prepareRestore, { backupId, recoveryCode });
  return {
    ...result,
    success: true,
    relaunchRequired: true,
    rescueFile: result.restoreId,
  };
}

export async function deleteBackup(
  backupId: string,
): Promise<{ deleted: true; success: true }> {
  if (testHarnessEnabled()) return (await testHarness()).deleteBackup(backupId);
  const result = await invokeNativeSurvivability<{ deleted: true }>(
    SURVIVABILITY_OPERATIONS.deleteBackup,
    { backupId },
  );
  return { ...result, success: true };
}
