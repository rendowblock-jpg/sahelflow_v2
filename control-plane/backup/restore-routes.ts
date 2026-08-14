import { deleteBackup } from "./delete";
import { downloadChunk } from "./download-chunk";
import { downloadManifest } from "./download-manifest";
import { restorePlan } from "./restore-plan";
import type { BackupWorkerEnvironment } from "./types";
import { verifyBackup } from "./verify";

export async function routeBackupRestore(
  request: Request,
  environment: BackupWorkerEnvironment,
  url: URL,
): Promise<Response | null> {
  const manifest = /^\/v1\/backups\/([A-Za-z0-9][A-Za-z0-9_-]{7,127})\/manifest$/.exec(url.pathname);
  if (manifest?.[1] && request.method === "GET") {
    return downloadManifest(request, environment, manifest[1], url);
  }
  const chunk = /^\/v1\/backups\/([A-Za-z0-9][A-Za-z0-9_-]{7,127})\/chunks\/(\d+)$/.exec(url.pathname);
  if (chunk?.[1] && chunk[2] && request.method === "GET") {
    return downloadChunk(request, environment, chunk[1], chunk[2], url);
  }
  const verify = /^\/v1\/backups\/([A-Za-z0-9][A-Za-z0-9_-]{7,127})\/verify$/.exec(url.pathname);
  if (verify?.[1] && request.method === "POST") {
    return verifyBackup(request, environment, verify[1]);
  }
  const restore = /^\/v1\/backups\/([A-Za-z0-9][A-Za-z0-9_-]{7,127})\/restore-plan$/.exec(url.pathname);
  if (restore?.[1] && request.method === "GET") {
    return restorePlan(request, environment, restore[1], url);
  }
  const backup = /^\/v1\/backups\/([A-Za-z0-9][A-Za-z0-9_-]{7,127})$/.exec(url.pathname);
  if (backup?.[1] && request.method === "DELETE") {
    return deleteBackup(request, environment, backup[1], url);
  }
  return null;
}
