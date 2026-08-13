import { authenticateBackupWorkspace, json } from "./auth";
import { loadBackup, putExpectedObject } from "./r2-integrity";
import type { BackupWorkerEnvironment } from "./types";

const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;

export async function storeManifest(
  request: Request,
  environment: BackupWorkerEnvironment,
  backupId: string,
  url: URL,
): Promise<Response> {
  const workspaceId = url.searchParams.get("workspaceId") ?? "";
  if (!ID.test(workspaceId) || !ID.test(backupId)) return json({ error: "invalid_request" }, 400);
  if (!(await authenticateBackupWorkspace(request, environment, workspaceId))) {
    return json({ error: "unauthorized" }, 401);
  }
  const backup = await loadBackup(environment, workspaceId, backupId);
  if (!backup) return json({ error: "backup_not_found" }, 404);
  if (backup.state === "verified" || backup.state === "deleted" || backup.state === "deleting") {
    return json({ error: "backup_not_uploadable", state: backup.state }, 409);
  }
  const outcome = await putExpectedObject(
    request,
    environment,
    `backup/${workspaceId}/${backupId}/manifest.bin`,
    backup.manifest_bytes,
    backup.manifest_sha256,
    { workspaceId, backupId, objectKind: "manifest" },
  );
  if (outcome === "mismatch") return json({ error: "manifest_integrity_mismatch" }, 409);
  const updated = await environment.DB.prepare(
    `UPDATE cloud_backup
        SET manifest_uploaded_at = COALESCE(manifest_uploaded_at, CURRENT_TIMESTAMP),
            state = CASE WHEN state = 'initiated' THEN 'uploading' ELSE state END
      WHERE workspace_id = ?1 AND backup_id = ?2`,
  ).bind(workspaceId, backupId).run();
  if (!updated.success) return json({ error: "backup_metadata_unavailable" }, 503);
  return json({ backupId, status: "uploaded", replay: outcome === "already_stored" });
}
