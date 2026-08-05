import "server-only";

import {
  invokeNativeSurvivability,
  SURVIVABILITY_OPERATIONS,
} from "@/lib/survivability/native-bridge";

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
}

export async function createBackup(): Promise<BackupEntry> {
  return invokeNativeSurvivability<BackupEntry>(
    SURVIVABILITY_OPERATIONS.createBackup,
  );
}

export async function listBackups(): Promise<BackupEntry[]> {
  return invokeNativeSurvivability<BackupEntry[]>(
    SURVIVABILITY_OPERATIONS.listBackups,
  );
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
  return invokeNativeSurvivability<RestorePreparationResult>(
    SURVIVABILITY_OPERATIONS.prepareRestore,
    { backupId, recoveryCode },
  );
}

export async function deleteBackup(
  backupId: string,
): Promise<{ deleted: true }> {
  return invokeNativeSurvivability<{ deleted: true }>(
    SURVIVABILITY_OPERATIONS.deleteBackup,
    { backupId },
  );
}
