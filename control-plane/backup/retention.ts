import type { BackupWorkerEnvironment } from "./types";

const KEEP_BY_CLASS = Object.freeze({
  daily: 7,
  weekly: 4,
  monthly: 6,
} as const);

type RotatingRetentionClass = keyof typeof KEEP_BY_CLASS;

async function deleteBackupObjects(
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

export async function expireInterruptedBackups(
  environment: BackupWorkerEnvironment,
  workspaceId: string,
): Promise<void> {
  const stale = await environment.DB.prepare(
    `SELECT backup_id
       FROM cloud_backup
      WHERE workspace_id = ?1
        AND state IN ('initiated','uploading','awaiting_verification')
        AND datetime(created_at) <= datetime('now', '-24 hours')
      ORDER BY created_at ASC
      LIMIT 64`,
  ).bind(workspaceId).all<{ backup_id: string }>();
  for (const row of stale.results ?? []) {
    await deleteBackupObjects(environment, workspaceId, row.backup_id);
    const released = await environment.DB.prepare(
      `UPDATE cloud_backup
          SET state = 'failed', deleted_at = CURRENT_TIMESTAMP
        WHERE workspace_id = ?1 AND backup_id = ?2
          AND state IN ('initiated','uploading','awaiting_verification')`,
    ).bind(workspaceId, row.backup_id).run();
    if (!released.success) throw new Error("stale_backup_cleanup_unavailable");
  }
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
