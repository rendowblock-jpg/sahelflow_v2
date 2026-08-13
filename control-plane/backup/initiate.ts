import { authenticateBackupWorkspace, json } from "./auth";
import type { BackupWorkerEnvironment, D1Statement } from "./types";

const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const MAX_CHUNKS = 512;
const MAX_CHUNK_BYTES = 64 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 4 * 1024 * 1024;

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

  if (trialLike) {
    const existingTrial = await environment.DB.prepare(
      `SELECT backup_id FROM cloud_backup
        WHERE workspace_id = ?1 AND state NOT IN ('failed','deleted') LIMIT 1`,
    ).bind(workspaceId).first<{ backup_id: string }>();
    if (existingTrial) return json({ error: "trial_backup_already_exists" }, 409);
  }
  const usage = await environment.DB.prepare(
    `SELECT COALESCE(SUM(total_bytes), 0) AS used_bytes
       FROM cloud_backup
      WHERE workspace_id = ?1 AND state NOT IN ('failed','deleted')`,
  ).bind(workspaceId).first<{ used_bytes: number }>();
  const usedBytes = Number(usage?.used_bytes ?? 0);
  if (!Number.isSafeInteger(usedBytes) || usedBytes < 0 || usedBytes + totalBytes > workspace.backup_bytes) {
    return json({ error: "backup_quota_exceeded" }, 403);
  }

  const statements: D1Statement[] = [
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
  ];
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
  } catch {
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
