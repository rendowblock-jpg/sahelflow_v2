/**
 * Delete a backup everywhere without ever leaving the seller with neither copy
 * after a partial failure (S01b-07).
 *
 * Order: the LOCAL copy first, the cloud (off-site) copy second.
 *  - The local delete fails while the local copy is still there (or cannot be
 *    proven gone): stop. The cloud copy is untouched, both copies survive.
 *  - The local delete succeeds and the cloud delete then fails: the local copy
 *    is already gone, so report a partial result (`cloudState: "unavailable"`)
 *    instead of an error. A retry finds the local copy absent and still removes
 *    the cloud copy.
 *  - The local copy is already gone (a retry, or a cloud-only entry): continue
 *    to the cloud copy; if nothing exists anywhere the original error stands.
 */
import "server-only";

import { deleteBackup, listBackups } from "@/lib/backup";
import { backupFailureCode } from "@/lib/backup/failure-code";
import { deleteCloudBackupIfEnrolled } from "@/lib/connected-platform/cloud-backup";
import { logger } from "@/lib/logger";

type CloudContext = Parameters<typeof deleteCloudBackupIfEnrolled>[0];
type LocalDeleteResult = Awaited<ReturnType<typeof deleteBackup>>;

export interface BackupDeleteOutcome {
  result: LocalDeleteResult;
  cloudDeleted: boolean;
  cloudState: "deleted" | "not_present" | "unavailable";
}

/** True unless the listing proves the local copy is gone (fail closed). */
async function localCopyMayStillExist(backupId: string): Promise<boolean> {
  try {
    return (await listBackups()).some((entry) => entry.backupId === backupId);
  } catch {
    return true;
  }
}

export async function deleteBackupLocalFirst(
  context: CloudContext,
  backupId: string,
): Promise<BackupDeleteOutcome> {
  let result: LocalDeleteResult | null = null;
  let localError: unknown;
  try {
    result = await deleteBackup(backupId);
  } catch (error) {
    if (await localCopyMayStillExist(backupId)) throw error;
    localError = error;
  }

  let cloudDeleted = false;
  try {
    cloudDeleted = await deleteCloudBackupIfEnrolled(context, backupId);
  } catch (cloudError) {
    if (!result) throw cloudError;
    logger.warn("backup.cloud_delete_failed", {
      backupId,
      code: backupFailureCode(cloudError),
    });
    return { result, cloudDeleted: false, cloudState: "unavailable" };
  }

  if (!result) {
    if (!cloudDeleted) throw localError;
    result = { deleted: true, success: true };
  }
  return {
    result,
    cloudDeleted,
    cloudState: cloudDeleted ? "deleted" : "not_present",
  };
}
