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
  const rows = await environment.DB.prepare(
    `SELECT backup_id, shop_id, retention_class, manifest_sha256, manifest_bytes,
            chunk_count, total_bytes, state, created_at, verified_at
       FROM cloud_backup
      WHERE workspace_id = ?1 AND state <> 'deleted'
      ORDER BY created_at DESC LIMIT ?2`,
  ).bind(workspaceId, limit).all<Record<string, unknown>>();
  return json({ backups: rows.results ?? [] });
}
