import { bootstrapBackupWorkspace, json } from "./auth";
import { initiateBackup } from "./initiate";
import { listBackups } from "./list";
import { routeBackupRestore } from "./restore-routes";
import type { BackupWorkerEnvironment } from "./types";
import { routeBackupUpload } from "./upload-routes";

async function health(environment: BackupWorkerEnvironment): Promise<Response> {
  try {
    await environment.DB.prepare("SELECT workspace_id FROM backup_workspace LIMIT 1")
      .first<{ workspace_id: string }>();
    await environment.BACKUPS.head("__sahelflow_backup_health_probe__");
    return json({ status: "ok" });
  } catch {
    return json({ status: "unavailable" }, 503);
  }
}

export async function handleBackupRequest(
  request: Request,
  environment: BackupWorkerEnvironment,
): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/healthz") return health(environment);
  if (request.method === "POST" && url.pathname === "/v1/bootstrap") {
    return bootstrapBackupWorkspace(request, environment);
  }
  if (request.method === "POST" && url.pathname === "/v1/backups") {
    return initiateBackup(request, environment);
  }
  if (request.method === "GET" && url.pathname === "/v1/backups") {
    return listBackups(request, environment, url);
  }
  const upload = await routeBackupUpload(request, environment, url);
  if (upload) return upload;
  const restore = await routeBackupRestore(request, environment, url);
  return restore ?? json({ error: "not_found" }, 404);
}
