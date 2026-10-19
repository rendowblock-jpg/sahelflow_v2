import type { BackupWorkerEnvironment } from "./types";

/**
 * How many verified points a seller keeps per shop and class. The quota rule in
 * schema.sql (and migrations/0004) repeats these numbers as `keep - 1`; the
 * contract test in retention.test.ts fails if the two ever drift apart.
 */
export const KEEP_BY_CLASS = Object.freeze({
  daily: 7,
  weekly: 4,
  monthly: 6,
  // ARCHITECTURE 7.2 / 10.3: a trial seller keeps ONE rolling cloud point; a newer
  // verified backup replaces the older one instead of being refused.
  trial: 1,
} as const);

type RotatingRetentionClass = keyof typeof KEEP_BY_CLASS;

/** An upload that has not finished this long after it began is abandoned. */
export const ABANDONED_AFTER_HOURS = 24;
/** A reservation with no progress for this long gives way to a new backup. */
export const IDLE_SUPERSEDE_MINUTES = 60;
/** ARCHITECTURE 7.2: trial data is kept this long after the licence expires. */
export const TRIAL_KEEP_DAYS_AFTER_EXPIRY = 30;

// A Worker invocation on the Free plan may make 50 subrequests, and every D1
// and R2 call counts. Each retired backup costs about three, so each cleanup
// pass is bounded; the scheduled maintenance keeps going on its next run.
const INITIATE_EXPIRE_LIMIT = 6;
const INITIATE_SUPERSEDE_LIMIT = 3;

const IN_FLIGHT = "'initiated','uploading','awaiting_verification'";

export async function deleteBackupObjects(
  environment: BackupWorkerEnvironment,
  workspaceId: string,
  backupId: string,
): Promise<void> {
  const rows = await environment.DB.prepare(
    `SELECT object_key FROM cloud_backup_chunk
      WHERE workspace_id = ?1 AND backup_id = ?2`,
  ).bind(workspaceId, backupId).all<{ object_key: string }>();
  const keys = [
    `backup/${workspaceId}/${backupId}/manifest.bin`,
    ...(rows.results ?? []).map((row) => row.object_key),
  ];
  await environment.BACKUPS.delete(keys);
}

async function failInFlightBackup(
  environment: BackupWorkerEnvironment,
  workspaceId: string,
  backupId: string,
): Promise<void> {
  await deleteBackupObjects(environment, workspaceId, backupId);
  const released = await environment.DB.prepare(
    `UPDATE cloud_backup
        SET state = 'failed', deleted_at = CURRENT_TIMESTAMP
      WHERE workspace_id = ?1 AND backup_id = ?2
        AND state IN (${IN_FLIGHT})`,
  ).bind(workspaceId, backupId).run();
  if (!released.success) throw new Error("stale_backup_cleanup_unavailable");
}

/** Uploads of one seller that began more than a day ago and never finished. */
export async function expireInterruptedBackups(
  environment: BackupWorkerEnvironment,
  workspaceId: string,
  limit: number = INITIATE_EXPIRE_LIMIT,
): Promise<number> {
  const stale = await environment.DB.prepare(
    `SELECT backup_id
       FROM cloud_backup
      WHERE workspace_id = ?1
        AND state IN (${IN_FLIGHT})
        AND datetime(created_at) <= datetime('now', '-${ABANDONED_AFTER_HOURS} hours')
      ORDER BY created_at ASC
      LIMIT ?2`,
  ).bind(workspaceId, limit).all<{ backup_id: string }>();
  let released = 0;
  for (const row of stale.results ?? []) {
    await failInFlightBackup(environment, workspaceId, row.backup_id);
    released += 1;
  }
  return released;
}

/**
 * A seller starting a NEW backup while an older reservation of theirs has made
 * no progress for an hour: the older one is dead (a closed laptop, a lost
 * connection). Release it now so a trial seller is not locked out for a day by
 * their own interrupted upload. The backup being (re)started is never touched.
 */
export async function supersedeIdleBackups(
  environment: BackupWorkerEnvironment,
  workspaceId: string,
  exceptBackupId: string,
  limit: number = INITIATE_SUPERSEDE_LIMIT,
): Promise<number> {
  const idle = await environment.DB.prepare(
    `SELECT b.backup_id
       FROM cloud_backup b
      WHERE b.workspace_id = ?1 AND b.backup_id <> ?2
        AND b.state IN (${IN_FLIGHT})
        AND datetime(MAX(
              b.created_at,
              COALESCE(b.manifest_uploaded_at, b.created_at),
              COALESCE((SELECT MAX(c.uploaded_at) FROM cloud_backup_chunk c
                         WHERE c.workspace_id = b.workspace_id
                           AND c.backup_id = b.backup_id), b.created_at)
            )) <= datetime('now', '-${IDLE_SUPERSEDE_MINUTES} minutes')
      ORDER BY b.created_at ASC
      LIMIT ?3`,
  ).bind(workspaceId, exceptBackupId, limit).all<{ backup_id: string }>();
  let released = 0;
  for (const row of idle.results ?? []) {
    await failInFlightBackup(environment, workspaceId, row.backup_id);
    released += 1;
  }
  return released;
}

/** The same cleanup across every seller; run by the scheduled maintenance. */
export async function expireAbandonedEverywhere(
  environment: BackupWorkerEnvironment,
  limit: number,
): Promise<number> {
  const stale = await environment.DB.prepare(
    `SELECT workspace_id, backup_id
       FROM cloud_backup
      WHERE state IN (${IN_FLIGHT})
        AND datetime(created_at) <= datetime('now', '-${ABANDONED_AFTER_HOURS} hours')
      ORDER BY created_at ASC
      LIMIT ?1`,
  ).bind(limit).all<{ workspace_id: string; backup_id: string }>();
  let released = 0;
  for (const row of stale.results ?? []) {
    await failInFlightBackup(environment, row.workspace_id, row.backup_id);
    released += 1;
  }
  return released;
}

/**
 * ARCHITECTURE 7.2: a trial (or extension) seller's cloud data is kept for 30
 * days after the licence expires, then removed. Both the stored objects and the
 * rows' state are handled; the workspace record itself stays so the licence
 * cannot be enrolled again as a fresh trial.
 */
export async function purgeExpiredTrialData(
  environment: BackupWorkerEnvironment,
  limit: number,
): Promise<{ purged: number; incomplete: number }> {
  const due = await environment.DB.prepare(
    `SELECT b.workspace_id, b.backup_id
       FROM cloud_backup b
       JOIN backup_workspace w ON w.workspace_id = b.workspace_id
      WHERE w.license_type <> 'permanent'
        AND w.entitlement_expires_at IS NOT NULL
        AND datetime(w.entitlement_expires_at) <= datetime('now', '-${TRIAL_KEEP_DAYS_AFTER_EXPIRY} days')
        AND b.state <> 'deleted'
      ORDER BY w.entitlement_expires_at ASC, b.created_at ASC
      LIMIT ?1`,
  ).bind(limit).all<{ workspace_id: string; backup_id: string }>();
  let purged = 0;
  let incomplete = 0;
  for (const row of due.results ?? []) {
    const marked = await environment.DB.prepare(
      `UPDATE cloud_backup SET state = 'deleting'
        WHERE workspace_id = ?1 AND backup_id = ?2 AND state <> 'deleted'`,
    ).bind(row.workspace_id, row.backup_id).run();
    if (!marked.success || marked.meta?.changes !== 1) {
      incomplete += 1;
      continue;
    }
    try {
      await deleteBackupObjects(environment, row.workspace_id, row.backup_id);
    } catch {
      // Left in 'deleting': the next run selects it again and finishes.
      incomplete += 1;
      continue;
    }
    const done = await environment.DB.prepare(
      `UPDATE cloud_backup
          SET state = 'deleted', deleted_at = CURRENT_TIMESTAMP
        WHERE workspace_id = ?1 AND backup_id = ?2 AND state = 'deleting'`,
    ).bind(row.workspace_id, row.backup_id).run();
    if (done.success && done.meta?.changes === 1) purged += 1;
    else incomplete += 1;
  }
  return { purged, incomplete };
}

export async function enforceVerifiedRetention(
  environment: BackupWorkerEnvironment,
  workspaceId: string,
  shopId: string,
  retentionClass: string,
): Promise<void> {
  if (!(retentionClass in KEEP_BY_CLASS)) return;
  const keep = KEEP_BY_CLASS[retentionClass as RotatingRetentionClass];
  const overflow = await environment.DB.prepare(
    `SELECT backup_id
       FROM cloud_backup
      WHERE workspace_id = ?1 AND shop_id = ?2 AND retention_class = ?3
        AND state = 'verified'
      ORDER BY COALESCE(verified_at, created_at) DESC, created_at DESC, backup_id DESC
      LIMIT 256 OFFSET ?4`,
  ).bind(workspaceId, shopId, retentionClass, keep).all<{ backup_id: string }>();
  for (const row of overflow.results ?? []) {
    const marked = await environment.DB.prepare(
      `UPDATE cloud_backup SET state = 'deleting'
        WHERE workspace_id = ?1 AND backup_id = ?2 AND state = 'verified'`,
    ).bind(workspaceId, row.backup_id).run();
    if (!marked.success || marked.meta?.changes !== 1) continue;
    try {
      await deleteBackupObjects(environment, workspaceId, row.backup_id);
    } catch (error) {
      await environment.DB.prepare(
        `UPDATE cloud_backup SET state = 'verified'
          WHERE workspace_id = ?1 AND backup_id = ?2 AND state = 'deleting'`,
      ).bind(workspaceId, row.backup_id).run();
      throw error;
    }
    const completed = await environment.DB.prepare(
      `UPDATE cloud_backup
          SET state = 'deleted', deleted_at = CURRENT_TIMESTAMP
        WHERE workspace_id = ?1 AND backup_id = ?2 AND state = 'deleting'`,
    ).bind(workspaceId, row.backup_id).run();
    if (!completed.success || completed.meta?.changes !== 1) {
      throw new Error("backup_retention_finalize_conflict");
    }
  }
}
