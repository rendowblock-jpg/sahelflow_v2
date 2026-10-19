import {
  expireAbandonedEverywhere,
  purgeExpiredTrialData,
} from "./retention";
import type { BackupWorkerEnvironment } from "./types";

// Each pass is bounded because a Worker invocation on the Free plan may make
// only 50 subrequests (every D1 and R2 call counts) and each backup costs about
// three. The schedule runs hourly, so the backlog drains within the day.
const ABANDONED_PER_RUN = 4;
const TRIAL_PURGE_PER_RUN = 4;

export type MaintenanceReport = Readonly<{
  abandonedReleased: number;
  trialBackupsPurged: number;
  trialBackupsIncomplete: number;
  failedSteps: number;
}>;

/**
 * Scheduled maintenance (a Cron Trigger, see wrangler.jsonc.example).
 *  1. Release uploads that began more than 24 hours ago and never finished, for
 *     every seller (before, this ran only when that seller started a backup).
 *  2. Remove the cloud data of trial/extension licences that expired more than
 *     30 days ago (ARCHITECTURE 7.2).
 * It logs counts only: no workspace, shop or backup identifier.
 */
export async function runScheduledMaintenance(
  environment: BackupWorkerEnvironment,
): Promise<MaintenanceReport> {
  let abandonedReleased = 0;
  let trialBackupsPurged = 0;
  let trialBackupsIncomplete = 0;
  let failedSteps = 0;
  try {
    abandonedReleased = await expireAbandonedEverywhere(environment, ABANDONED_PER_RUN);
  } catch {
    failedSteps += 1;
  }
  try {
    const purge = await purgeExpiredTrialData(environment, TRIAL_PURGE_PER_RUN);
    trialBackupsPurged = purge.purged;
    trialBackupsIncomplete = purge.incomplete;
  } catch {
    failedSteps += 1;
  }
  const report: MaintenanceReport = Object.freeze({
    abandonedReleased,
    trialBackupsPurged,
    trialBackupsIncomplete,
    failedSteps,
  });
  if (abandonedReleased + trialBackupsPurged + trialBackupsIncomplete + failedSteps > 0) {
    console.warn(JSON.stringify({ event: "backup.maintenance", ...report }));
  }
  return report;
}
