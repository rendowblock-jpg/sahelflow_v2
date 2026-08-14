import { authenticateBackupWorkspace, json } from "./auth";
import { loadBackup } from "./r2-integrity";
import type { BackupChunkRow, BackupWorkerEnvironment } from "./types";

const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;

export async function downloadChunk(
  request: Request,
  environment: BackupWorkerEnvironment,
  backupId: string,
  chunkIndexRaw: string,
  url: URL,
): Promise<Response> {
  const workspaceId = url.searchParams.get("workspaceId") ?? "";
  const chunkIndex = Number(chunkIndexRaw);
  if (!ID.test(workspaceId) || !ID.test(backupId) || !Number.isSafeInteger(chunkIndex) || chunkIndex < 0) {
    return json({ error: "invalid_request" }, 400);
  }
  if (!(await authenticateBackupWorkspace(request, environment, workspaceId))) return json({ error: "unauthorized" }, 401);
  const backup = await loadBackup(environment, workspaceId, backupId);
  if (!backup || backup.state !== "verified") return json({ error: "backup_not_verified" }, 409);
  const chunk = await environment.DB.prepare(
    `SELECT workspace_id, backup_id, chunk_index, object_key, sha256, byte_size, uploaded_at, etag
       FROM cloud_backup_chunk
      WHERE workspace_id = ?1 AND backup_id = ?2 AND chunk_index = ?3`,
  ).bind(workspaceId, backupId, chunkIndex).first<BackupChunkRow>();
  if (!chunk?.uploaded_at) return json({ error: "chunk_not_found" }, 404);
  const object = await environment.BACKUPS.get(chunk.object_key);
  if (!object) return json({ error: "remote_object_missing" }, 503);
  return new Response(object.body, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(object.size),
      "Cache-Control": "no-store",
      "X-SahelFlow-SHA256": chunk.sha256,
    },
  });
}
