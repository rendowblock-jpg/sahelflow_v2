import { storeChunk } from "./chunk";
import { storeManifest } from "./manifest";
import type { BackupWorkerEnvironment } from "./types";

export async function routeBackupUpload(
  request: Request,
  environment: BackupWorkerEnvironment,
  url: URL,
): Promise<Response | null> {
  const manifest = /^\/v1\/backups\/([A-Za-z0-9][A-Za-z0-9_-]{7,127})\/manifest$/.exec(url.pathname);
  if (manifest?.[1] && request.method === "PUT") {
    return storeManifest(request, environment, manifest[1], url);
  }
  const chunk = /^\/v1\/backups\/([A-Za-z0-9][A-Za-z0-9_-]{7,127})\/chunks\/(\d+)$/.exec(url.pathname);
  if (chunk?.[1] && chunk[2] && request.method === "PUT") {
    return storeChunk(request, environment, chunk[1], chunk[2], url);
  }
  return null;
}
