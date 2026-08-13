import { base64Bytes, randomToken, sha256Hex, verifyEntitlement } from "./crypto";
import type { BackupWorkerEnvironment, BackupWorkspaceRow } from "./types";

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const BACKUP_FEATURE = "sahelflow.backup";
const COMPLETE_FEATURE = "sahelflow.complete";

function hasBackupFeature(featuresJson: string): boolean {
  try {
    const features = JSON.parse(featuresJson) as unknown;
    return Array.isArray(features) && features.every((feature) => typeof feature === "string") &&
      (features.includes(COMPLETE_FEATURE) || features.includes(BACKUP_FEATURE));
  } catch {
    return false;
  }
}

export function json(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function bearerToken(request: Request): string | null {
  const value = request.headers.get("Authorization");
  if (!value?.startsWith("Bearer ")) return null;
  const token = value.slice(7).trim();
  return token.length >= 32 && token.length <= 256 ? token : null;
}

export async function authenticateBackupWorkspace(
  request: Request,
  environment: BackupWorkerEnvironment,
  workspaceId: string,
): Promise<BackupWorkspaceRow | null> {
  const token = bearerToken(request);
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const workspace = await environment.DB.prepare(
    `SELECT workspace_id, license_id, installation_id, license_type, backup_bytes,
            entitlement_expires_at, features_json, entitlement_revocation_epoch,
            desktop_token_hash, desktop_signing_public_key, revoked_at
       FROM backup_workspace
      WHERE workspace_id = ?1 AND desktop_token_hash = ?2 AND revoked_at IS NULL
        AND (entitlement_expires_at IS NULL OR datetime(entitlement_expires_at) > CURRENT_TIMESTAMP)`,
  ).bind(workspaceId, tokenHash).first<BackupWorkspaceRow>();
  return workspace && hasBackupFeature(workspace.features_json) ? workspace : null;
}

export async function bootstrapBackupWorkspace(
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
  const input = body as { entitlement?: unknown; desktopSigningPublicKey?: unknown };
  if (
    typeof input.desktopSigningPublicKey !== "string" ||
    !BASE64.test(input.desktopSigningPublicKey) ||
    base64Bytes(input.desktopSigningPublicKey).byteLength !== 32
  ) return json({ error: "invalid_signing_key" }, 400);

  let entitlement;
  try {
    entitlement = await verifyEntitlement(input.entitlement, environment);
  } catch {
    return json({ error: "entitlement_rejected" }, 403);
  }
  const { claims } = entitlement;
  if (!hasBackupFeature(JSON.stringify(claims.features))) {
    return json({ error: "backup_not_entitled" }, 403);
  }
  const existing = await environment.DB.prepare(
    "SELECT workspace_id FROM backup_workspace WHERE workspace_id = ?1",
  ).bind(claims.workspaceId).first<{ workspace_id: string }>();
  if (existing) return json({ error: "already_bootstrapped" }, 409);

  const desktopToken = randomToken();
  const tokenHash = await sha256Hex(desktopToken);
  const inserted = await environment.DB.prepare(
    `INSERT OR IGNORE INTO backup_workspace
      (workspace_id, license_id, installation_id, license_type, entitlement_expires_at,
       backup_bytes, features_json, entitlement_revocation_epoch, desktop_token_hash,
       desktop_signing_public_key)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
  ).bind(
    claims.workspaceId,
    claims.licenseId,
    claims.installationId,
    claims.type,
    claims.expiresAt,
    claims.backupBytes,
    JSON.stringify(claims.features),
    claims.revocationEpoch,
    tokenHash,
    input.desktopSigningPublicKey,
  ).run();
  if (!inserted.success || inserted.meta?.changes === 0) {
    return json({ error: "bootstrap_conflict" }, 409);
  }
  return json({
    workspaceId: claims.workspaceId,
    backupToken: desktopToken,
    backupBytes: claims.backupBytes,
    licenseType: claims.type,
  }, 201);
}
