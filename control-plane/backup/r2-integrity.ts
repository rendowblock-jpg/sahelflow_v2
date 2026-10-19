import { arrayBufferHex, hexBytes } from "./crypto";
import { damagedChunks, type ChunkRecord, type RemoteObject } from "./plan";
import type { BackupRow, BackupWorkerEnvironment, R2Object } from "./types";

const SHA256 = /^[0-9a-f]{64}$/;

function contentLength(request: Request): number | null {
  const raw = request.headers.get("Content-Length");
  if (!raw || !/^\d+$/.test(raw)) return null;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function objectMatches(
  object: R2Object,
  expectedBytes: number,
  expectedSha256: string,
): boolean {
  return object.size === expectedBytes &&
    arrayBufferHex(object.checksums.sha256) === expectedSha256;
}

/**
 * Indexes of the uploaded chunks whose stored object is gone or is no longer the
 * object that was accepted. ONE listing of the backup's prefix answers for every
 * chunk (a backup has up to 512), where a lookup per chunk would exceed the 50
 * subrequests a Worker invocation may make on the Free plan.
 */
export async function damagedChunkIndexes(
  environment: BackupWorkerEnvironment,
  workspaceId: string,
  backupId: string,
): Promise<number[]> {
  const records = await environment.DB.prepare(
    `SELECT chunk_index, object_key, byte_size, sha256, etag
       FROM cloud_backup_chunk
      WHERE workspace_id = ?1 AND backup_id = ?2
      ORDER BY chunk_index`,
  ).bind(workspaceId, backupId).all<ChunkRecord>();
  const remote = new Map<string, RemoteObject>();
  let cursor: string | undefined;
  for (let page = 0; page < 4; page += 1) {
    const listed = await environment.BACKUPS.list({
      prefix: `backup/${workspaceId}/${backupId}/`,
      limit: 1000,
      cursor,
    });
    for (const object of listed.objects) {
      remote.set(object.key, {
        size: object.size,
        etag: object.etag,
        sha256: arrayBufferHex(object.checksums?.sha256),
      });
    }
    if (!listed.truncated) break;
    cursor = listed.cursor;
  }
  return damagedChunks(records.results ?? [], remote);
}

export async function putExpectedObject(
  request: Request,
  environment: BackupWorkerEnvironment,
  objectKey: string,
  expectedBytes: number,
  expectedSha256: string,
  metadata: Record<string, string>,
): Promise<"stored" | "already_stored" | "mismatch"> {
  const headerSha = request.headers.get("X-SahelFlow-SHA256");
  const length = contentLength(request);
  if (
    headerSha !== expectedSha256 ||
    !SHA256.test(headerSha) ||
    length !== expectedBytes ||
    !request.body
  ) return "mismatch";

  const existing = await environment.BACKUPS.head(objectKey);
  if (existing) {
    return objectMatches(existing, expectedBytes, expectedSha256)
      ? "already_stored"
      : "mismatch";
  }

  let stored: R2Object | null = null;
  try {
    stored = await environment.BACKUPS.put(objectKey, request.body, {
      sha256: hexBytes(expectedSha256),
      customMetadata: metadata,
    });
  } catch {
    return "mismatch";
  }
  if (!stored || !objectMatches(stored, expectedBytes, expectedSha256)) {
    if (stored) await environment.BACKUPS.delete(objectKey);
    return "mismatch";
  }
  return "stored";
}

export async function loadBackup(
  environment: BackupWorkerEnvironment,
  workspaceId: string,
  backupId: string,
): Promise<BackupRow | null> {
  return environment.DB.prepare(
    `SELECT workspace_id, backup_id, shop_id, retention_class, wrapped_dek,
            manifest_sha256, manifest_bytes, manifest_uploaded_at, chunk_count,
            total_bytes, state, verification_receipt_digest, created_at, verified_at
       FROM cloud_backup
      WHERE workspace_id = ?1 AND backup_id = ?2`,
  ).bind(workspaceId, backupId).first<BackupRow>();
}
