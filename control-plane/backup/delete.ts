import { authenticateBackupWorkspace, json } from "./auth";
import { loadBackup } from "./r2-integrity";
import type { BackupWorkerEnvironment } from "./types";

const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;

export async function deleteBackup(
  request: Request,
  environment: BackupWorkerEnvironment,
  backupId: string,
  url: URL,
): Promise<Response> {
  const workspaceId = url.searchParams.get("workspaceId") ?? "";
  if (!ID.test(workspaceId) || !ID.test(backupId)) return json({ error: "invalid_request" }, 400);
  if (!(await authenticateBackupWorkspace(request, environment, workspaceId))) return json({ error: "unauthorized" }, 401);
  const backup = await loadBackup(environment, workspaceId, backupId);
  if (!backup) return json({ error: "backup_not_found" }, 404);
  if (backup.state === "deleted") return json({ backupId, state: "deleted" });

  const marked = await environment.DB.prepare(
    `UPDATE cloud_backup SET state = 'deleting'
      WHERE workspace_id = ?1 AND backup_id = ?2 AND state <> 'deleted'`,
  ).bind(workspaceId, backupId).run();
  if (!marked.success) return json({ error: "delete_state_unavailable" }, 503);

  const chunkRows = await environment.DB.prepare(
    `SELECT object_key FROM cloud_backup_chunk
      WHERE workspace_id = ?1 AND backup_id = ?2`,
  ).bind(workspaceId, backupId).all<{ object_key: string }>();
  const keys = [
    `backup/${workspaceId}/${backupId}/manifest.bin`,
    ...(chunkRows.results ?? []).map((row) => row.object_key),
  ];
  try {
    await environment.BACKUPS.delete(keys);
  } catch {
    return json({ error: "remote_delete_incomplete", retryable: true }, 503);
  }
  const completed = await environment.DB.prepare(
    `UPDATE cloud_backup
        SET state = 'deleted', deleted_at = CURRENT_TIMESTAMP
      WHERE workspace_id = ?1 AND backup_id = ?2 AND state = 'deleting'`,
  ).bind(workspaceId, backupId).run();
  if (!completed.success || completed.meta?.changes === 0) {
    return json({ error: "delete_finalize_conflict", retryable: true }, 409);
  }
  return json({ backupId, state: "deleted" });
}
