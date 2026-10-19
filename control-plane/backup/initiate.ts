import { authenticateBackupWorkspace, json } from "./auth";
import {
  arrivedChunkIndexes,
  planMatches,
  type RequestedPlan,
  type StoredChunkPlan,
} from "./plan";
import { loadBackup } from "./r2-integrity";
import {
  deleteBackupObjects,
  expireInterruptedBackups,
  supersedeIdleBackups,
} from "./retention";
import type { BackupRow, BackupWorkerEnvironment, D1Statement } from "./types";

const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const MAX_CHUNKS = 512;
const MAX_CHUNK_BYTES = 64 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 4 * 1024 * 1024;

/**
 * A backup id that is already reserved: the same plan resumes it, a different
 * plan is a conflict. The desktop's cloud backup id is the id of its local
 * backup, so a retry after a dropped connection, a crash or a timed-out verify
 * sends exactly the same plan; before this it was refused for the rest of the
 * reservation's life, and for a trial seller it also blocked every other backup.
 */
async function answerForExisting(
  environment: BackupWorkerEnvironment,
  existing: BackupRow,
  workspaceId: string,
  backupId: string,
  requested: RequestedPlan,
): Promise<Response> {
  const rows = await environment.DB.prepare(
    `SELECT chunk_index, sha256, byte_size, uploaded_at
       FROM cloud_backup_chunk
      WHERE workspace_id = ?1 AND backup_id = ?2
      ORDER BY chunk_index`,
  ).bind(workspaceId, backupId).all<StoredChunkPlan>();
  const stored = rows.results ?? [];
  if (!planMatches(existing, stored, requested)) return json({ error: "backup_plan_conflict" }, 409);
  if (existing.state === "verified") {
    return json({
      backupId,
      state: "verified",
      resumed: true,
      verifiedAt: existing.verified_at,
      receiptDigest: existing.verification_receipt_digest,
    });
  }
  if (
    existing.state === "initiated" ||
    existing.state === "uploading" ||
    existing.state === "awaiting_verification"
  ) {
    return json({
      backupId,
      state: existing.state,
      resumed: true,
      manifestUploaded: existing.manifest_uploaded_at !== null,
      uploadedChunks: arrivedChunkIndexes(stored),
      manifestObjectKey: `backup/${workspaceId}/${backupId}/manifest.bin`,
      chunkCount: stored.length,
      totalBytes: Number(existing.total_bytes),
    });
  }
  return json({ error: "backup_not_resumable", state: existing.state }, 409);
}

export async function initiateBackup(
  request: Request,
  environment: BackupWorkerEnvironment,
): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ error: "invalid_request" }, 400);
  }
  const input = body as Record<string, unknown>;
  const workspaceId = String(input.workspaceId ?? "");
  const backupId = String(input.backupId ?? "");
  const shopId = String(input.shopId ?? "");
  const retentionClass = input.retentionClass;
  const wrappedDek = String(input.wrappedDek ?? "");
  const manifestSha256 = String(input.manifestSha256 ?? "");
  const manifestBytes = Number(input.manifestBytes);
  if (
    !ID.test(workspaceId) ||
    !ID.test(backupId) ||
    !ID.test(shopId) ||
    (retentionClass !== "daily" &&
      retentionClass !== "weekly" &&
      retentionClass !== "monthly" &&
      retentionClass !== "pinned" &&
      retentionClass !== "trial") ||
    !BASE64.test(wrappedDek) ||
    wrappedDek.length < 16 ||
    wrappedDek.length > 4096 ||
    !SHA256.test(manifestSha256) ||
    !Number.isSafeInteger(manifestBytes) ||
    manifestBytes < 1 ||
    manifestBytes > MAX_MANIFEST_BYTES ||
    !Array.isArray(input.chunks) ||
    input.chunks.length < 1 ||
    input.chunks.length > MAX_CHUNKS
  ) return json({ error: "invalid_request" }, 400);

  const workspace = await authenticateBackupWorkspace(request, environment, workspaceId);
  if (!workspace) return json({ error: "unauthorized" }, 401);
  const trialLike = workspace.license_type !== "permanent";
  if ((trialLike && retentionClass !== "trial") || (!trialLike && retentionClass === "trial")) {
    return json({ error: "retention_not_entitled" }, 403);
  }

  const chunks: Array<{ index: number; sha256: string; byteSize: number }> = [];
  let totalBytes = manifestBytes;
  for (let index = 0; index < input.chunks.length; index += 1) {
    const raw = input.chunks[index];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return json({ error: "invalid_chunk_plan" }, 400);
    }
    const row = raw as Record<string, unknown>;
    const chunkIndex = Number(row.index);
    const sha256 = String(row.sha256 ?? "");
    const byteSize = Number(row.byteSize);
    if (
      chunkIndex !== index ||
      !SHA256.test(sha256) ||
      !Number.isSafeInteger(byteSize) ||
      byteSize < 1 ||
      byteSize > MAX_CHUNK_BYTES ||
      !Number.isSafeInteger(totalBytes + byteSize)
    ) return json({ error: "invalid_chunk_plan" }, 400);
    totalBytes += byteSize;
    chunks.push({ index, sha256, byteSize });
  }
  if (totalBytes > workspace.backup_bytes) return json({ error: "backup_quota_exceeded" }, 403);

  try {
    await expireInterruptedBackups(environment, workspaceId);
    await supersedeIdleBackups(environment, workspaceId, backupId);
  } catch {
    return json({ error: "backup_cleanup_unavailable", retryable: true }, 503);
  }

  const requested: RequestedPlan = {
    shopId,
    retentionClass: String(retentionClass),
    wrappedDek,
    manifestSha256,
    manifestBytes,
    totalBytes,
    chunks,
  };
  const statements: D1Statement[] = [];
  const existing = await loadBackup(environment, workspaceId, backupId);
  if (existing && existing.state !== "failed") {
    return answerForExisting(environment, existing, workspaceId, backupId, requested);
  }
  if (existing) {
    // A failed reservation is dead (expired or superseded) and its objects are
    // gone. The same backup id may be reserved again from the start.
    try {
      await deleteBackupObjects(environment, workspaceId, backupId);
    } catch {
      return json({ error: "backup_cleanup_unavailable", retryable: true }, 503);
    }
    statements.push(
      environment.DB.prepare(
        `DELETE FROM cloud_backup_chunk
          WHERE workspace_id = ?1 AND backup_id = ?2
            AND EXISTS (SELECT 1 FROM cloud_backup b
                         WHERE b.workspace_id = ?1 AND b.backup_id = ?2 AND b.state = 'failed')`,
      ).bind(workspaceId, backupId),
      environment.DB.prepare(
        `DELETE FROM cloud_backup
          WHERE workspace_id = ?1 AND backup_id = ?2 AND state = 'failed'`,
      ).bind(workspaceId, backupId),
    );
  }

  statements.push(
    environment.DB.prepare(
      `INSERT INTO cloud_backup
        (workspace_id, backup_id, shop_id, retention_class, wrapped_dek,
         manifest_sha256, manifest_bytes, chunk_count, total_bytes, state)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'initiated')`,
    ).bind(
      workspaceId,
      backupId,
      shopId,
      retentionClass,
      wrappedDek,
      manifestSha256,
      manifestBytes,
      chunks.length,
      totalBytes,
    ),
  );
  for (const chunk of chunks) {
    statements.push(environment.DB.prepare(
      `INSERT INTO cloud_backup_chunk
        (workspace_id, backup_id, chunk_index, object_key, sha256, byte_size)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
    ).bind(
      workspaceId,
      backupId,
      chunk.index,
      `backup/${workspaceId}/${backupId}/chunk-${String(chunk.index).padStart(5, "0")}.bin`,
      chunk.sha256,
      chunk.byteSize,
    ));
  }
  try {
    const outcomes = await environment.DB.batch(statements);
    if (outcomes.some((outcome) => !outcome.success)) return json({ error: "backup_plan_unavailable" }, 503);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("backup_quota_exceeded")) {
      return json({ error: "backup_quota_exceeded" }, 403);
    }
    if (message.includes("trial_backup_already_exists")) {
      return json({ error: "trial_backup_already_exists" }, 409);
    }
    if (message.includes("pinned_backup_limit_reached")) {
      return json({ error: "pinned_backup_limit_reached" }, 409);
    }
    if (message.includes("backup_entitlement_expired")) {
      return json({ error: "backup_not_entitled" }, 403);
    }
    // Two identical requests at the same moment (a retry that overtook a slow
    // first attempt): the batch rolled back on the primary key, nothing is half
    // written. Answer for the reservation that won, exactly like a later retry.
    if (/UNIQUE constraint failed|SQLITE_CONSTRAINT_PRIMARYKEY/i.test(message)) {
      const stored = await loadBackup(environment, workspaceId, backupId);
      if (stored && stored.state !== "failed") {
        return answerForExisting(environment, stored, workspaceId, backupId, requested);
      }
    }
    return json({ error: "backup_plan_conflict" }, 409);
  }
  return json({
    backupId,
    state: "initiated",
    manifestObjectKey: `backup/${workspaceId}/${backupId}/manifest.bin`,
    chunkCount: chunks.length,
    totalBytes,
  }, 201);
}
