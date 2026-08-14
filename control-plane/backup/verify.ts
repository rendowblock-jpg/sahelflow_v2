import { authenticateBackupWorkspace, json } from "./auth";
import { sha256Hex, verifyEd25519 } from "./crypto";
import { loadBackup, objectMatches } from "./r2-integrity";
import { enforceVerifiedRetention } from "./retention";
import type { BackupWorkerEnvironment } from "./types";
import {
  CLOUD_BACKUP_VERIFICATION_DOMAIN,
  canonicalBackupVerificationBytes,
} from "../../src/lib/connected-platform/backup-protocol";

const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const RECEIPT_CLOCK_SKEW_MS = 10 * 60 * 1000;

export async function verifyBackup(
  request: Request,
  environment: BackupWorkerEnvironment,
  backupId: string,
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
  const input = body as {
    workspaceId?: unknown;
    verifiedAt?: unknown;
    signature?: unknown;
  };
  const workspaceId = String(input.workspaceId ?? "");
  const verifiedAt = String(input.verifiedAt ?? "");
  const signature = String(input.signature ?? "");
  const verifiedAtMs = Date.parse(verifiedAt);
  if (
    !ID.test(workspaceId) ||
    !ID.test(backupId) ||
    !Number.isFinite(verifiedAtMs) ||
    Math.abs(Date.now() - verifiedAtMs) > RECEIPT_CLOCK_SKEW_MS ||
    !BASE64.test(signature) ||
    signature.length < 40 ||
    signature.length > 256
  ) return json({ error: "invalid_request" }, 400);

  const workspace = await authenticateBackupWorkspace(request, environment, workspaceId);
  if (!workspace) return json({ error: "unauthorized" }, 401);
  const backup = await loadBackup(environment, workspaceId, backupId);
  if (!backup) return json({ error: "backup_not_found" }, 404);
  if (backup.state === "verified") {
    try {
      await enforceVerifiedRetention(
        environment,
        workspaceId,
        backup.shop_id,
        backup.retention_class,
      );
    } catch {
      return json({ error: "retention_cleanup_unavailable", retryable: true }, 503);
    }
    return json({ backupId, state: "verified", verifiedAt: backup.verified_at });
  }
  if (backup.state === "deleted" || backup.state === "deleting" || backup.state === "failed") {
    return json({ error: "backup_not_verifiable", state: backup.state }, 409);
  }
  if (!backup.manifest_uploaded_at) return json({ error: "manifest_missing" }, 409);

  const missing = await environment.DB.prepare(
    `SELECT COUNT(*) AS missing_count
       FROM cloud_backup_chunk
      WHERE workspace_id = ?1 AND backup_id = ?2 AND uploaded_at IS NULL`,
  ).bind(workspaceId, backupId).first<{ missing_count: number }>();
  if (Number(missing?.missing_count ?? backup.chunk_count) !== 0) {
    return json({ error: "chunks_missing" }, 409);
  }

  const manifest = await environment.BACKUPS.head(
    `backup/${workspaceId}/${backupId}/manifest.bin`,
  );
  if (!manifest || !objectMatches(manifest, backup.manifest_bytes, backup.manifest_sha256)) {
    return json({ error: "manifest_remote_verification_failed" }, 409);
  }

  const canonical = canonicalBackupVerificationBytes({
    workspaceId,
    shopId: backup.shop_id,
    backupId,
    manifestSha256: backup.manifest_sha256,
    totalBytes: backup.total_bytes,
    chunkCount: backup.chunk_count,
    verifiedAt,
  });
  let signatureValid = false;
  try {
    signatureValid = await verifyEd25519(
      workspace.desktop_signing_public_key,
      signature,
      canonical,
    );
  } catch {
    signatureValid = false;
  }
  if (!signatureValid) return json({ error: "verification_receipt_rejected" }, 403);

  const receiptDigest = await sha256Hex(JSON.stringify([
    CLOUD_BACKUP_VERIFICATION_DOMAIN,
    workspaceId,
    backup.shop_id,
    backupId,
    backup.manifest_sha256,
    backup.total_bytes,
    backup.chunk_count,
    verifiedAt,
    signature,
  ]));
  const result = await environment.DB.prepare(
    `UPDATE cloud_backup
        SET state = 'verified', verification_receipt_digest = ?1, verified_at = ?2
      WHERE workspace_id = ?3 AND backup_id = ?4
        AND state IN ('initiated','uploading','awaiting_verification')`,
  ).bind(receiptDigest, verifiedAt, workspaceId, backupId).run();
  if (!result.success || result.meta?.changes === 0) {
    return json({ error: "verification_conflict" }, 409);
  }
  try {
    await enforceVerifiedRetention(
      environment,
      workspaceId,
      backup.shop_id,
      backup.retention_class,
    );
  } catch {
    return json({ error: "retention_cleanup_unavailable", retryable: true }, 503);
  }
  return json({
    backupId,
    state: "verified",
    verifiedAt,
    receiptDigest,
  });
}
