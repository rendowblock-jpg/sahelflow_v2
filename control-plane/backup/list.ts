import { authenticateBackupWorkspace, json } from "./auth";
import type { BackupWorkerEnvironment } from "./types";

const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;

export async function listBackups(
  request: Request,
  environment: BackupWorkerEnvironment,
  url: URL,
): Promise<Response> {
  const workspaceId = url.searchParams.get("workspaceId") ?? "";
  const limit = Number(url.searchParams.get("limit") ?? "50");
  if (!ID.test(workspaceId) || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    return json({ error: "invalid_request" }, 400);
  }
  if (!(await authenticateBackupWorkspace(request, environment, workspaceId))) {
    return json({ error: "unauthorized" }, 401);
  }
  // manifest_uploaded_at and chunks_uploaded let the desktop (and a support
  // person) see how far an interrupted backup got: "3 of 5 chunks arrived".
  const rows = await environment.DB.prepare(
    `SELECT b.backup_id, b.shop_id, b.retention_class, b.manifest_sha256, b.manifest_bytes,
            b.chunk_count, b.total_bytes, b.state, b.created_at, b.verified_at,
            b.manifest_uploaded_at,
            (SELECT COUNT(*) FROM cloud_backup_chunk c
              WHERE c.workspace_id = b.workspace_id AND c.backup_id = b.backup_id
                AND c.uploaded_at IS NOT NULL) AS chunks_uploaded
       FROM cloud_backup b
      WHERE b.workspace_id = ?1 AND b.state <> 'deleted'
      ORDER BY b.created_at DESC LIMIT ?2`,
  ).bind(workspaceId, limit).all<Record<string, unknown>>();
  return json({ backups: rows.results ?? [] });
}
