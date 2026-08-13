import { authenticateBackupWorkspace, json } from "./auth";
import { loadBackup } from "./r2-integrity";
import type { BackupWorkerEnvironment } from "./types";

const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;

export async function restorePlan(
  request: Request,
  environment: BackupWorkerEnvironment,
  backupId: string,
  url: URL,
): Promise<Response> {
  const workspaceId = url.searchParams.get("workspaceId") ?? "";
  if (!ID.test(workspaceId) || !ID.test(backupId)) return json({ error: "invalid_request" }, 400);
  if (!(await authenticateBackupWorkspace(request, environment, workspaceId))) return json({ error: "unauthorized" }, 401);
  const backup = await loadBackup(environment, workspaceId, backupId);
  if (!backup || backup.state !== "verified") return json({ error: "backup_not_verified" }, 409);
  const chunks = await environment.DB.prepare(
    `SELECT chunk_index, sha256, byte_size
       FROM cloud_backup_chunk
      WHERE workspace_id = ?1 AND backup_id = ?2 AND uploaded_at IS NOT NULL
      ORDER BY chunk_index ASC`,
  ).bind(workspaceId, backupId).all<Record<string, unknown>>();
  return json({
    backupId,
    shopId: backup.shop_id,
    wrappedDek: backup.wrapped_dek,
    manifestSha256: backup.manifest_sha256,
    manifestBytes: backup.manifest_bytes,
    totalBytes: backup.total_bytes,
    chunks: chunks.results ?? [],
  });
}
