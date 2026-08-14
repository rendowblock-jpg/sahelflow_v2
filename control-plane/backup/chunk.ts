import { authenticateBackupWorkspace, json } from "./auth";
import { loadBackup, objectMatches, putExpectedObject } from "./r2-integrity";
import type { BackupChunkRow, BackupWorkerEnvironment } from "./types";

const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;

export async function storeChunk(
  request: Request,
  environment: BackupWorkerEnvironment,
  backupId: string,
  chunkIndexRaw: string,
  url: URL,
): Promise<Response> {
  const workspaceId = url.searchParams.get("workspaceId") ?? "";
  const chunkIndex = Number(chunkIndexRaw);
  if (
    !ID.test(workspaceId) ||
    !ID.test(backupId) ||
    !Number.isSafeInteger(chunkIndex) ||
    chunkIndex < 0
  ) return json({ error: "invalid_request" }, 400);
  if (!(await authenticateBackupWorkspace(request, environment, workspaceId))) {
    return json({ error: "unauthorized" }, 401);
  }
  const backup = await loadBackup(environment, workspaceId, backupId);
  if (!backup) return json({ error: "backup_not_found" }, 404);
  if (backup.state === "verified" || backup.state === "deleted" || backup.state === "deleting") {
    return json({ error: "backup_not_uploadable", state: backup.state }, 409);
  }
  const chunk = await environment.DB.prepare(
    `SELECT workspace_id, backup_id, chunk_index, object_key, sha256, byte_size,
            uploaded_at, etag
       FROM cloud_backup_chunk
      WHERE workspace_id = ?1 AND backup_id = ?2 AND chunk_index = ?3`,
  ).bind(workspaceId, backupId, chunkIndex).first<BackupChunkRow>();
  if (!chunk) return json({ error: "chunk_not_found" }, 404);

  const outcome = await putExpectedObject(
    request,
    environment,
    chunk.object_key,
    chunk.byte_size,
    chunk.sha256,
    { workspaceId, backupId, objectKind: "chunk", chunkIndex: String(chunkIndex) },
  );
  if (outcome === "mismatch") return json({ error: "chunk_integrity_mismatch" }, 409);
  const remote = await environment.BACKUPS.head(chunk.object_key);
  if (!remote || !objectMatches(remote, chunk.byte_size, chunk.sha256)) {
    return json({ error: "chunk_remote_verification_failed" }, 409);
  }
  const updated = await environment.DB.prepare(
    `UPDATE cloud_backup_chunk
        SET uploaded_at = COALESCE(uploaded_at, CURRENT_TIMESTAMP), etag = ?1
      WHERE workspace_id = ?2 AND backup_id = ?3 AND chunk_index = ?4`,
  ).bind(remote.etag, workspaceId, backupId, chunkIndex).run();
  if (!updated.success) return json({ error: "backup_metadata_unavailable" }, 503);
  await environment.DB.prepare(
    `UPDATE cloud_backup
        SET state = CASE WHEN state = 'initiated' THEN 'uploading' ELSE state END
      WHERE workspace_id = ?1 AND backup_id = ?2`,
  ).bind(workspaceId, backupId).run();
  return json({
    backupId,
    chunkIndex,
    status: "uploaded",
    replay: outcome === "already_stored",
  });
}
