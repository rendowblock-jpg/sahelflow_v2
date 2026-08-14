import { authenticateBackupWorkspace, json } from "./auth";
import { loadBackup } from "./r2-integrity";
import type { BackupWorkerEnvironment } from "./types";

const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;

export async function downloadManifest(
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
  const object = await environment.BACKUPS.get(`backup/${workspaceId}/${backupId}/manifest.bin`);
  if (!object) return json({ error: "remote_object_missing" }, 503);
  return new Response(object.body, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(object.size),
      "Cache-Control": "no-store",
      "X-SahelFlow-SHA256": backup.manifest_sha256,
    },
  });
}
