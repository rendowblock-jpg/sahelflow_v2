import {
  LICENSE_ENTITLEMENT_DOMAIN,
  LICENSE_ENTITLEMENT_FORMAT,
  canonicalEntitlementBytes,
} from "../../src/lib/license/entitlement-canonical";
import type { SignedEntitlement } from "../../src/lib/license/entitlement";
import {
  canonicalConnectedEnvelopeBytes,
  isConnectedEnvelope,
  type ConnectedEnvelope,
} from "../../src/lib/connected-platform/protocol";

type D1RunResult = {
  success: boolean;
  meta?: { changes?: number; last_row_id?: number };
};
type D1AllResult<T> = { success: boolean; results?: T[] };
type D1Statement = {
  bind: (...values: unknown[]) => D1Statement;
  first: <T>() => Promise<T | null>;
  all: <T>() => Promise<D1AllResult<T>>;
  run: () => Promise<D1RunResult>;
};
type D1Database = {
  prepare: (query: string) => D1Statement;
  batch: (statements: D1Statement[]) => Promise<D1RunResult[]>;
};

export interface ConnectedWorkerEnvironment {
  DB: D1Database;
  PRODUCT_MAJOR: string;
  SF_LICENSE_TRIAL_PUBLIC_KEYS: string;
  SF_LICENSE_PERMANENT_PUBLIC_KEYS: string;
}

type WorkspaceRow = {
  workspace_id: string;
  license_id: string;
  installation_id: string;
  device_binding: string;
  product_major: number;
  entitlement_expires_at: string | null;
  shop_slots: number;
  member_limit: number;
  device_limit: number;
  features_json: string;
  entitlement_revocation_epoch: number;
  desktop_token_hash: string;
  desktop_signing_public_key: string;
  desktop_encryption_public_key: string;
  revoked_at: string | null;
};

type PairingRow = {
  pairing_id: string;
  workspace_id: string;
  member_id: string;
  device_id: string;
  token_hash: string;
  expires_at: string;
  consumed_at: string | null;
};

type DeviceRow = {
  workspace_id: string;
  device_id: string;
  member_id: string;
  token_hash: string;
  signing_public_key: string;
  encryption_public_key: string;
  revocation_epoch: number;
  revoked_at: string | null;
};

type CommandRow = {
  relay_sequence: number;
  workspace_id: string;
  command_id: string;
  idempotency_key: string;
  envelope_digest: string;
  shop_id: string;
  member_id: string;
  device_id: string;
  envelope_json: string;
  state: "queued" | "committed" | "rejected" | "conflict" | "revoked" | "expired";
  expires_at: string;
  result_digest: string | null;
  result_json: string | null;
};

const OPAQUE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;
const HEX_ID = /^[0-9a-f]{32}$/i;
const DEVICE_BINDING = /^sfdb1_[0-9a-f]{64}$/;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const MAX_JWK_CHARS = 4096;
const PAIRING_TTL_MS = 10 * 60 * 1000;
const MAX_POLL_LIMIT = 100;
const COMPLETE_FEATURE = "sahelflow.complete";
const CONNECTED_FEATURE = "sahelflow.connected";
const STOREFRONT_FEATURE = "sahelflow.storefront";

function json(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function validIdentity(value: unknown): value is string {
  return typeof value === "string" && (HEX_ID.test(value) || OPAQUE_ID.test(value));
}

function hasWorkspaceFeature(workspace: Pick<WorkspaceRow, "features_json">, feature: string): boolean {
  try {
    const features = JSON.parse(workspace.features_json) as unknown;
    return Array.isArray(features) && features.every((entry) => typeof entry === "string") &&
      (features.includes(COMPLETE_FEATURE) || features.includes(feature));
  } catch {
    return false;
  }
}

function base64Bytes(value: string): Uint8Array {
  if (!BASE64.test(value)) throw new Error("invalid base64");
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function arrayBuffer(value: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(value.byteLength);
  new Uint8Array(copy).set(value);
  return copy;
}

function base64Url(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256Hex(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", arrayBuffer(bytes)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

function parsedKeyring(value: string): Record<string, string> {
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("keyring must be an object");
  }
  const result: Record<string, string> = {};
  for (const [key, item] of Object.entries(parsed)) {
    if (!OPAQUE_ID.test(key) || typeof item !== "string") throw new Error("invalid keyring");
    result[key] = item;
  }
  return result;
}

async function importEd25519PublicKey(value: string): Promise<CryptoKey> {
  const raw = base64Bytes(value);
  if (raw.byteLength !== 32) throw new Error("Ed25519 public key must be 32 bytes");
  return crypto.subtle.importKey("raw", arrayBuffer(raw), { name: "Ed25519" }, false, ["verify"]);
}

async function verifyEd25519(
  publicKeyBase64: string,
  signatureBase64: string,
  message: Uint8Array,
): Promise<boolean> {
  const key = await importEd25519PublicKey(publicKeyBase64);
  return crypto.subtle.verify(
    { name: "Ed25519" },
    key,
    arrayBuffer(base64Bytes(signatureBase64)),
    arrayBuffer(message),
  );
}

function validRsaEncryptionJwk(value: unknown): value is string {
  if (typeof value !== "string" || value.length < 32 || value.length > MAX_JWK_CHARS) return false;
  try {
    const jwk = JSON.parse(value) as Record<string, unknown>;
    return jwk.kty === "RSA" && typeof jwk.n === "string" && typeof jwk.e === "string";
  } catch {
    return false;
  }
}

async function verifyEntitlement(
  input: unknown,
  environment: ConnectedWorkerEnvironment,
): Promise<SignedEntitlement> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("invalid entitlement");
  const entitlement = input as SignedEntitlement;
  const claims = entitlement.claims;
  if (
    !claims ||
    claims.domain !== LICENSE_ENTITLEMENT_DOMAIN ||
    claims.formatVersion !== LICENSE_ENTITLEMENT_FORMAT ||
    !validIdentity(claims.workspaceId) ||
    !HEX_ID.test(claims.installationId) ||
    !DEVICE_BINDING.test(claims.deviceBinding) ||
    !OPAQUE_ID.test(claims.licenseId) ||
    !OPAQUE_ID.test(claims.keyId) ||
    typeof entitlement.signature !== "string" ||
    !BASE64.test(entitlement.signature) ||
    claims.transferState !== "active" ||
    !Number.isSafeInteger(claims.revocationEpoch) ||
    claims.revocationEpoch < 0 ||
    !Number.isSafeInteger(claims.shopSlots) ||
    claims.shopSlots < 1 ||
    !Number.isSafeInteger(claims.memberLimit) ||
    claims.memberLimit < 1 ||
    !Number.isSafeInteger(claims.deviceLimit) ||
    claims.deviceLimit < 1 ||
    !Array.isArray(claims.features) ||
    claims.features.length < 1 ||
    !claims.features.every((feature) => typeof feature === "string")
  ) {
    throw new Error("invalid entitlement claims");
  }
  const productMajor = Number(environment.PRODUCT_MAJOR);
  if (!Number.isSafeInteger(productMajor) || productMajor < 1 || claims.productMajor !== productMajor) {
    throw new Error("product major mismatch");
  }
  if (claims.expiresAt && Date.parse(claims.expiresAt) <= Date.now()) throw new Error("entitlement expired");
  const ring = claims.issuer === "founder-offline"
    ? parsedKeyring(environment.SF_LICENSE_PERMANENT_PUBLIC_KEYS)
    : parsedKeyring(environment.SF_LICENSE_TRIAL_PUBLIC_KEYS);
  const publicKey = ring[claims.keyId];
  if (!publicKey) throw new Error("entitlement key unavailable");
  const verified = await verifyEd25519(
    publicKey,
    entitlement.signature,
    canonicalEntitlementBytes(claims),
  );
  if (!verified) throw new Error("entitlement signature invalid");
  return entitlement;
}

function bearerToken(request: Request): string | null {
  const value = request.headers.get("Authorization");
  if (!value?.startsWith("Bearer ")) return null;
  const token = value.slice(7).trim();
  return token.length >= 32 && token.length <= 256 ? token : null;
}

async function authenticateDesktop(
  request: Request,
  environment: ConnectedWorkerEnvironment,
  workspaceId: string,
  requiredFeature = CONNECTED_FEATURE,
): Promise<WorkspaceRow | null> {
  const token = bearerToken(request);
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const workspace = await environment.DB.prepare(
    `SELECT workspace_id, license_id, installation_id, device_binding, product_major,
            entitlement_expires_at, shop_slots, member_limit, device_limit, features_json,
            entitlement_revocation_epoch, desktop_token_hash, desktop_signing_public_key,
            desktop_encryption_public_key, revoked_at
       FROM connected_workspace
      WHERE workspace_id = ?1 AND desktop_token_hash = ?2 AND revoked_at IS NULL
        AND (entitlement_expires_at IS NULL OR datetime(entitlement_expires_at) > CURRENT_TIMESTAMP)`,
  ).bind(workspaceId, tokenHash).first<WorkspaceRow>();
  return workspace && hasWorkspaceFeature(workspace, requiredFeature) ? workspace : null;
}

async function authenticateDevice(
  request: Request,
  environment: ConnectedWorkerEnvironment,
  workspaceId: string,
  deviceId: string,
): Promise<DeviceRow | null> {
  const token = bearerToken(request);
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const device = await environment.DB.prepare(
    `SELECT d.workspace_id, d.device_id, d.member_id, d.token_hash, d.signing_public_key,
            d.encryption_public_key, d.revocation_epoch, d.revoked_at, w.features_json
       FROM connected_device d
       JOIN connected_workspace w ON w.workspace_id = d.workspace_id
      WHERE d.workspace_id = ?1 AND d.device_id = ?2 AND d.token_hash = ?3
        AND d.revoked_at IS NULL AND w.revoked_at IS NULL
        AND (w.entitlement_expires_at IS NULL OR datetime(w.entitlement_expires_at) > CURRENT_TIMESTAMP)`,
  ).bind(workspaceId, deviceId, tokenHash).first<DeviceRow & { features_json: string }>();
  if (device && !hasWorkspaceFeature(device, CONNECTED_FEATURE)) return null;
  if (device) {
    await environment.DB.prepare(
      "UPDATE connected_device SET last_seen_at = CURRENT_TIMESTAMP WHERE workspace_id = ?1 AND device_id = ?2",
    ).bind(workspaceId, deviceId).run();
  }
  return device;
}

async function verifyEnvelopeSignature(
  envelope: ConnectedEnvelope,
  publicKey: string,
): Promise<boolean> {
  return verifyEd25519(
    publicKey,
    envelope.signature,
    canonicalConnectedEnvelopeBytes(envelope),
  );
}

async function bootstrap(request: Request, environment: ConnectedWorkerEnvironment): Promise<Response> {
  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: "invalid_json" }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "invalid_request" }, 400);
  const input = body as {
    entitlement?: unknown;
    desktopSigningPublicKey?: unknown;
    desktopEncryptionPublicKey?: unknown;
  };
  if (
    typeof input.desktopSigningPublicKey !== "string" ||
    !BASE64.test(input.desktopSigningPublicKey) ||
    base64Bytes(input.desktopSigningPublicKey).byteLength !== 32 ||
    !validRsaEncryptionJwk(input.desktopEncryptionPublicKey)
  ) {
    return json({ error: "invalid_keys" }, 400);
  }
  let entitlement: SignedEntitlement;
  try { entitlement = await verifyEntitlement(input.entitlement, environment); }
  catch { return json({ error: "entitlement_rejected" }, 403); }
  const { claims } = entitlement;
  if (!claims.features.includes(COMPLETE_FEATURE) && !claims.features.includes(CONNECTED_FEATURE)) {
    return json({ error: "connected_not_entitled" }, 403);
  }
  const existing = await environment.DB.prepare(
    "SELECT workspace_id FROM connected_workspace WHERE workspace_id = ?1",
  ).bind(claims.workspaceId).first<{ workspace_id: string }>();
  if (existing) return json({ error: "already_bootstrapped" }, 409);

  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  const inserted = await environment.DB.prepare(
    `INSERT OR IGNORE INTO connected_workspace
      (workspace_id, license_id, installation_id, device_binding, product_major,
       entitlement_expires_at, shop_slots, member_limit, device_limit, features_json,
       entitlement_revocation_epoch, desktop_token_hash, desktop_signing_public_key,
       desktop_encryption_public_key)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)`,
  ).bind(
    claims.workspaceId,
    claims.licenseId,
    claims.installationId,
    claims.deviceBinding,
    claims.productMajor,
    claims.expiresAt,
    claims.shopSlots,
    claims.memberLimit,
    claims.deviceLimit,
    JSON.stringify(claims.features),
    claims.revocationEpoch,
    tokenHash,
    input.desktopSigningPublicKey,
    input.desktopEncryptionPublicKey,
  ).run();
  if (!inserted.success || inserted.meta?.changes === 0) return json({ error: "bootstrap_conflict" }, 409);
  return json({
    workspaceId: claims.workspaceId,
    desktopToken: token,
    protocolVersion: 1,
  }, 201);
}

async function createPairing(request: Request, environment: ConnectedWorkerEnvironment): Promise<Response> {
  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const input = body as { workspaceId?: unknown; memberId?: unknown; deviceId?: unknown };
  if (!validIdentity(input.workspaceId) || !validIdentity(input.memberId) || !validIdentity(input.deviceId)) {
    return json({ error: "invalid_request" }, 400);
  }
  const workspace = await authenticateDesktop(request, environment, input.workspaceId);
  if (!workspace) return json({ error: "unauthorized" }, 401);
  const pairingId = `pair_${crypto.randomUUID().replace(/-/g, "")}`;
  const pairingToken = randomToken();
  const tokenHash = await sha256Hex(pairingToken);
  const expiresAt = new Date(Date.now() + PAIRING_TTL_MS).toISOString();
  const result = await environment.DB.prepare(
    `INSERT INTO connected_pairing
      (pairing_id, workspace_id, member_id, device_id, token_hash, expires_at)
     SELECT ?1, ?2, ?3, ?4, ?5, ?6
      WHERE NOT EXISTS (
        SELECT 1 FROM connected_device
         WHERE workspace_id = ?2 AND device_id = ?4 AND revoked_at IS NULL
      )
        AND NOT EXISTS (
          SELECT 1 FROM connected_pairing
           WHERE workspace_id = ?2 AND device_id = ?4 AND consumed_at IS NULL
             AND datetime(expires_at) > CURRENT_TIMESTAMP
        )
        AND (
          (SELECT COUNT(*) FROM connected_device
            WHERE workspace_id = ?2 AND revoked_at IS NULL) +
          (SELECT COUNT(*) FROM connected_pairing
            WHERE workspace_id = ?2 AND consumed_at IS NULL
              AND datetime(expires_at) > CURRENT_TIMESTAMP)
        ) < ?7
        AND (
          EXISTS (
            SELECT 1 FROM connected_device
             WHERE workspace_id = ?2 AND member_id = ?3 AND revoked_at IS NULL
          )
          OR EXISTS (
            SELECT 1 FROM connected_pairing
             WHERE workspace_id = ?2 AND member_id = ?3 AND consumed_at IS NULL
               AND datetime(expires_at) > CURRENT_TIMESTAMP
          )
          OR (
            SELECT COUNT(*) FROM (
              SELECT member_id FROM connected_device
               WHERE workspace_id = ?2 AND revoked_at IS NULL
              UNION
              SELECT member_id FROM connected_pairing
               WHERE workspace_id = ?2 AND consumed_at IS NULL
                 AND datetime(expires_at) > CURRENT_TIMESTAMP
            )
          ) < ?8
        )`,
  ).bind(
    pairingId,
    input.workspaceId,
    input.memberId,
    input.deviceId,
    tokenHash,
    expiresAt,
    workspace.device_limit,
    workspace.member_limit,
  ).run();
  if (!result.success) return json({ error: "pairing_unavailable" }, 503);
  if (result.meta?.changes !== 1) return json({ error: "entitlement_limit_reached" }, 403);
  return json({ pairingId, pairingToken, expiresAt }, 201);
}

async function exchangePairing(request: Request, environment: ConnectedWorkerEnvironment): Promise<Response> {
  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const input = body as {
    pairingId?: unknown;
    pairingToken?: unknown;
    signingPublicKey?: unknown;
    encryptionPublicKey?: unknown;
  };
  if (
    !validIdentity(input.pairingId) ||
    typeof input.pairingToken !== "string" ||
    typeof input.signingPublicKey !== "string" ||
    !BASE64.test(input.signingPublicKey) ||
    base64Bytes(input.signingPublicKey).byteLength !== 32 ||
    !validRsaEncryptionJwk(input.encryptionPublicKey)
  ) {
    return json({ error: "invalid_request" }, 400);
  }
  const tokenHash = await sha256Hex(input.pairingToken);
  const pairing = await environment.DB.prepare(
    `SELECT pairing_id, workspace_id, member_id, device_id, token_hash, expires_at, consumed_at
       FROM connected_pairing
      WHERE pairing_id = ?1 AND token_hash = ?2`,
  ).bind(input.pairingId, tokenHash).first<PairingRow>();
  if (!pairing || pairing.consumed_at || Date.parse(pairing.expires_at) <= Date.now()) {
    return json({ error: "pairing_rejected" }, 403);
  }
  const workspace = await environment.DB.prepare(
    `SELECT workspace_id, license_id, installation_id, device_binding, product_major,
            entitlement_expires_at, shop_slots, member_limit, device_limit, features_json,
            entitlement_revocation_epoch, desktop_token_hash, desktop_signing_public_key,
            desktop_encryption_public_key, revoked_at
       FROM connected_workspace
      WHERE workspace_id = ?1 AND revoked_at IS NULL
        AND (entitlement_expires_at IS NULL OR datetime(entitlement_expires_at) > CURRENT_TIMESTAMP)`,
  ).bind(pairing.workspace_id).first<WorkspaceRow>();
  if (!workspace || !hasWorkspaceFeature(workspace, CONNECTED_FEATURE)) {
    return json({ error: "workspace_unavailable" }, 409);
  }

  const deviceToken = randomToken();
  const deviceTokenHash = await sha256Hex(deviceToken);
  try {
    const inserted = await environment.DB.prepare(
      `INSERT INTO connected_device
        (workspace_id, device_id, member_id, token_hash, signing_public_key, encryption_public_key,
         revocation_epoch)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7
        WHERE (
          SELECT COUNT(*) FROM connected_device
           WHERE workspace_id = ?1 AND revoked_at IS NULL
        ) < ?8
          AND (
            EXISTS (
              SELECT 1 FROM connected_device
               WHERE workspace_id = ?1 AND member_id = ?3 AND revoked_at IS NULL
            )
            OR (
              SELECT COUNT(DISTINCT member_id) FROM connected_device
               WHERE workspace_id = ?1 AND revoked_at IS NULL
            ) < ?9
          )`,
    ).bind(
      pairing.workspace_id,
      pairing.device_id,
      pairing.member_id,
      deviceTokenHash,
      input.signingPublicKey,
      input.encryptionPublicKey,
      workspace.entitlement_revocation_epoch,
      workspace.device_limit,
      workspace.member_limit,
    ).run();
    if (!inserted.success) return json({ error: "pairing_unavailable" }, 503);
    if (inserted.meta?.changes !== 1) return json({ error: "entitlement_limit_reached" }, 403);

    const consumed = await environment.DB.prepare(
      `UPDATE connected_pairing SET consumed_at = CURRENT_TIMESTAMP
        WHERE pairing_id = ?1 AND token_hash = ?2 AND consumed_at IS NULL
          AND datetime(expires_at) > CURRENT_TIMESTAMP`,
    ).bind(pairing.pairing_id, tokenHash).run();
    if (!consumed.success || consumed.meta?.changes !== 1) {
      await environment.DB.prepare(
        `DELETE FROM connected_device
          WHERE workspace_id = ?1 AND device_id = ?2 AND token_hash = ?3`,
      ).bind(pairing.workspace_id, pairing.device_id, deviceTokenHash).run();
      return json({ error: "pairing_conflict" }, 409);
    }
  } catch {
    return json({ error: "pairing_conflict" }, 409);
  }
  return json({
    workspaceId: pairing.workspace_id,
    memberId: pairing.member_id,
    deviceId: pairing.device_id,
    deviceToken,
    desktopSigningPublicKey: workspace.desktop_signing_public_key,
    desktopEncryptionPublicKey: workspace.desktop_encryption_public_key,
    revocationEpoch: workspace.entitlement_revocation_epoch,
  }, 201);
}

async function listDevices(request: Request, environment: ConnectedWorkerEnvironment, url: URL): Promise<Response> {
  const workspaceId = url.searchParams.get("workspaceId");
  if (!validIdentity(workspaceId)) return json({ error: "invalid_request" }, 400);
  if (!(await authenticateDesktop(request, environment, workspaceId))) return json({ error: "unauthorized" }, 401);
  const result = await environment.DB.prepare(
    `SELECT device_id, member_id, signing_public_key, encryption_public_key, revocation_epoch, last_seen_at
       FROM connected_device WHERE workspace_id = ?1 AND revoked_at IS NULL ORDER BY created_at ASC`,
  ).bind(workspaceId).all<{
    device_id: string;
    member_id: string;
    signing_public_key: string;
    encryption_public_key: string;
    revocation_epoch: number;
    last_seen_at: string | null;
  }>();
  return json({ devices: result.results ?? [] });
}

async function workspaceAuthority(
  request: Request,
  environment: ConnectedWorkerEnvironment,
  url: URL,
): Promise<Response> {
  const workspaceId = url.searchParams.get("workspaceId");
  const feature = url.searchParams.get("feature");
  if (!validIdentity(workspaceId) || (feature !== "connected" && feature !== "storefront")) {
    return json({ error: "invalid_request" }, 400);
  }
  const requiredFeature = feature === "storefront" ? STOREFRONT_FEATURE : CONNECTED_FEATURE;
  const workspace = await authenticateDesktop(request, environment, workspaceId, requiredFeature);
  if (!workspace) return json({ error: "unauthorized" }, 401);
  return json({
    workspaceId: workspace.workspace_id,
    shopSlots: workspace.shop_slots,
    memberLimit: workspace.member_limit,
    deviceLimit: workspace.device_limit,
    entitlementExpiresAt: workspace.entitlement_expires_at,
  });
}

async function putProjection(request: Request, environment: ConnectedWorkerEnvironment): Promise<Response> {
  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: "invalid_json" }, 400); }
  if (!isConnectedEnvelope(body)) return json({ error: "invalid_envelope" }, 400);
  const envelope = body;
  if (
    envelope.senderKind !== "desktop" ||
    envelope.recipientKind !== "device" ||
    envelope.senderId !== envelope.installationId ||
    envelope.recipientId !== envelope.deviceId ||
    !envelope.messageType.startsWith("projection.") ||
    Date.parse(envelope.expiresAt) <= Date.now()
  ) return json({ error: "invalid_projection_scope" }, 400);
  const workspace = await authenticateDesktop(request, environment, envelope.workspaceId);
  if (!workspace || workspace.installation_id !== envelope.installationId) return json({ error: "unauthorized" }, 401);
  if (!(await verifyEnvelopeSignature(envelope, workspace.desktop_signing_public_key))) {
    return json({ error: "invalid_signature" }, 403);
  }
  const device = await environment.DB.prepare(
    `SELECT workspace_id, device_id, member_id, token_hash, signing_public_key,
            encryption_public_key, revocation_epoch, revoked_at
       FROM connected_device WHERE workspace_id = ?1 AND device_id = ?2 AND revoked_at IS NULL`,
  ).bind(envelope.workspaceId, envelope.deviceId).first<DeviceRow>();
  if (!device || device.member_id !== envelope.memberId || envelope.revocationEpoch !== device.revocation_epoch) {
    return json({ error: "projection_recipient_rejected" }, 403);
  }
  const projectionType = envelope.messageType.slice("projection.".length);
  const result = await environment.DB.prepare(
    `INSERT INTO connected_projection
      (workspace_id, shop_id, member_id, device_id, projection_type, sequence, envelope_id,
       envelope_json, expires_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, CURRENT_TIMESTAMP)
     ON CONFLICT(workspace_id, shop_id, device_id, projection_type) DO UPDATE SET
       member_id = excluded.member_id,
       sequence = excluded.sequence,
       envelope_id = excluded.envelope_id,
       envelope_json = excluded.envelope_json,
       expires_at = excluded.expires_at,
       updated_at = CURRENT_TIMESTAMP
     WHERE excluded.sequence > connected_projection.sequence`,
  ).bind(
    envelope.workspaceId,
    envelope.shopId,
    envelope.memberId,
    envelope.deviceId,
    projectionType,
    envelope.sequence,
    envelope.envelopeId,
    JSON.stringify(envelope),
    envelope.expiresAt,
  ).run();
  if (!result.success) return json({ error: "projection_unavailable" }, 503);
  if (result.meta?.changes === 0) return json({ error: "stale_projection" }, 409);
  return json({ status: "stored", sequence: envelope.sequence }, 202);
}

async function getProjection(request: Request, environment: ConnectedWorkerEnvironment, url: URL): Promise<Response> {
  const workspaceId = url.searchParams.get("workspaceId");
  const deviceId = url.searchParams.get("deviceId");
  const shopId = url.searchParams.get("shopId");
  const type = url.searchParams.get("type");
  if (!validIdentity(workspaceId) || !validIdentity(deviceId) || !validIdentity(shopId) || !type || !/^[a-z0-9._-]{2,95}$/.test(type)) {
    return json({ error: "invalid_request" }, 400);
  }
  const device = await authenticateDevice(request, environment, workspaceId, deviceId);
  if (!device) return json({ error: "unauthorized" }, 401);
  const row = await environment.DB.prepare(
    `SELECT envelope_json, expires_at FROM connected_projection
      WHERE workspace_id = ?1 AND shop_id = ?2 AND device_id = ?3 AND member_id = ?4 AND projection_type = ?5`,
  ).bind(workspaceId, shopId, deviceId, device.member_id, type).first<{ envelope_json: string; expires_at: string }>();
  if (!row || Date.parse(row.expires_at) <= Date.now()) return json({ error: "projection_unavailable" }, 404);
  return new Response(row.envelope_json, {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

async function submitCommand(request: Request, environment: ConnectedWorkerEnvironment): Promise<Response> {
  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: "invalid_json" }, 400); }
  if (!isConnectedEnvelope(body)) return json({ error: "invalid_envelope" }, 400);
  const envelope = body;
  if (
    envelope.senderKind !== "device" ||
    envelope.recipientKind !== "desktop" ||
    envelope.senderId !== envelope.deviceId ||
    envelope.recipientId !== envelope.installationId ||
    !envelope.messageType.startsWith("command.") ||
    envelope.messageType === "command.result" ||
    Date.parse(envelope.expiresAt) <= Date.now()
  ) return json({ error: "invalid_command_scope" }, 400);
  const device = await authenticateDevice(request, environment, envelope.workspaceId, envelope.deviceId);
  if (!device || device.member_id !== envelope.memberId || envelope.revocationEpoch !== device.revocation_epoch) {
    return json({ error: "unauthorized" }, 401);
  }
  const workspace = await environment.DB.prepare(
    "SELECT installation_id, revoked_at FROM connected_workspace WHERE workspace_id = ?1",
  ).bind(envelope.workspaceId).first<{ installation_id: string; revoked_at: string | null }>();
  if (!workspace || workspace.revoked_at || workspace.installation_id !== envelope.installationId) {
    return json({ error: "workspace_scope_rejected" }, 403);
  }
  if (!(await verifyEnvelopeSignature(envelope, device.signing_public_key))) {
    return json({ error: "invalid_signature" }, 403);
  }
  const digest = await sha256Hex(canonicalConnectedEnvelopeBytes(envelope));
  const existing = await environment.DB.prepare(
    `SELECT relay_sequence, workspace_id, command_id, idempotency_key, envelope_digest, shop_id,
            member_id, device_id, envelope_json, state, expires_at, result_digest, result_json
       FROM connected_command
      WHERE workspace_id = ?1 AND (command_id = ?2 OR idempotency_key = ?3)`,
  ).bind(envelope.workspaceId, envelope.envelopeId, envelope.idempotencyKey).first<CommandRow>();
  if (existing) {
    if (existing.envelope_digest !== digest) return json({ error: "idempotency_conflict" }, 409);
    return json({ commandId: existing.command_id, state: existing.state, relaySequence: existing.relay_sequence }, 200);
  }
  const result = await environment.DB.prepare(
    `INSERT INTO connected_command
      (workspace_id, command_id, idempotency_key, envelope_digest, shop_id, member_id, device_id,
       envelope_json, state, expires_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'queued', ?9)`,
  ).bind(
    envelope.workspaceId,
    envelope.envelopeId,
    envelope.idempotencyKey,
    digest,
    envelope.shopId,
    envelope.memberId,
    envelope.deviceId,
    JSON.stringify(envelope),
    envelope.expiresAt,
  ).run();
  if (!result.success) return json({ error: "command_unavailable" }, 503);
  return json({ commandId: envelope.envelopeId, state: "queued", relaySequence: result.meta?.last_row_id ?? null }, 202);
}

async function pollCommands(request: Request, environment: ConnectedWorkerEnvironment, url: URL): Promise<Response> {
  const workspaceId = url.searchParams.get("workspaceId");
  const afterRaw = url.searchParams.get("after") ?? "0";
  const limitRaw = url.searchParams.get("limit") ?? "50";
  const after = Number(afterRaw);
  const limit = Number(limitRaw);
  if (!validIdentity(workspaceId) || !Number.isSafeInteger(after) || after < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > MAX_POLL_LIMIT) {
    return json({ error: "invalid_request" }, 400);
  }
  if (!(await authenticateDesktop(request, environment, workspaceId))) return json({ error: "unauthorized" }, 401);
  await environment.DB.prepare(
    `UPDATE connected_command SET state = 'expired', completed_at = CURRENT_TIMESTAMP
      WHERE workspace_id = ?1 AND state = 'queued' AND expires_at <= ?2`,
  ).bind(workspaceId, new Date().toISOString()).run();
  const rows = await environment.DB.prepare(
    `SELECT relay_sequence, command_id, envelope_json
       FROM connected_command
      WHERE workspace_id = ?1 AND relay_sequence > ?2 AND state = 'queued'
      ORDER BY relay_sequence ASC LIMIT ?3`,
  ).bind(workspaceId, after, limit).all<{ relay_sequence: number; command_id: string; envelope_json: string }>();
  const commands = (rows.results ?? []).map((row) => ({
    relaySequence: row.relay_sequence,
    commandId: row.command_id,
    envelope: JSON.parse(row.envelope_json) as unknown,
  }));
  return json({ commands, nextCursor: commands.at(-1)?.relaySequence ?? after });
}

async function completeCommand(
  request: Request,
  environment: ConnectedWorkerEnvironment,
  commandId: string,
): Promise<Response> {
  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const input = body as { state?: unknown; envelope?: unknown };
  if (!(["committed", "rejected", "conflict"] as const).includes(input.state as "committed") || !isConnectedEnvelope(input.envelope)) {
    return json({ error: "invalid_request" }, 400);
  }
  const envelope = input.envelope;
  if (
    envelope.envelopeId !== commandId ||
    envelope.messageType !== "command.result" ||
    envelope.senderKind !== "desktop" ||
    envelope.recipientKind !== "device" ||
    envelope.senderId !== envelope.installationId ||
    envelope.recipientId !== envelope.deviceId ||
    Date.parse(envelope.expiresAt) <= Date.now()
  ) return json({ error: "invalid_result_scope" }, 400);
  const workspace = await authenticateDesktop(request, environment, envelope.workspaceId);
  if (!workspace || workspace.installation_id !== envelope.installationId) return json({ error: "unauthorized" }, 401);
  if (!(await verifyEnvelopeSignature(envelope, workspace.desktop_signing_public_key))) return json({ error: "invalid_signature" }, 403);
  const command = await environment.DB.prepare(
    `SELECT relay_sequence, workspace_id, command_id, idempotency_key, envelope_digest, shop_id,
            member_id, device_id, envelope_json, state, expires_at, result_digest, result_json
       FROM connected_command WHERE workspace_id = ?1 AND command_id = ?2`,
  ).bind(envelope.workspaceId, commandId).first<CommandRow>();
  if (!command || command.shop_id !== envelope.shopId || command.member_id !== envelope.memberId || command.device_id !== envelope.deviceId) {
    return json({ error: "command_not_found" }, 404);
  }
  const digest = await sha256Hex(canonicalConnectedEnvelopeBytes(envelope));
  if (command.state !== "queued") {
    if (command.state === input.state && command.result_digest === digest) {
      return json({ commandId, state: command.state }, 200);
    }
    return json({ error: "terminal_conflict", state: command.state }, 409);
  }
  const result = await environment.DB.prepare(
    `UPDATE connected_command
        SET state = ?1, result_digest = ?2, result_json = ?3, completed_at = CURRENT_TIMESTAMP
      WHERE workspace_id = ?4 AND command_id = ?5 AND state = 'queued'`,
  ).bind(input.state, digest, JSON.stringify(envelope), envelope.workspaceId, commandId).run();
  if (!result.success || result.meta?.changes === 0) return json({ error: "command_completion_conflict" }, 409);
  return json({ commandId, state: input.state }, 200);
}

async function commandStatus(
  request: Request,
  environment: ConnectedWorkerEnvironment,
  commandId: string,
  url: URL,
): Promise<Response> {
  const workspaceId = url.searchParams.get("workspaceId");
  const deviceId = url.searchParams.get("deviceId");
  if (!validIdentity(workspaceId) || !validIdentity(deviceId)) return json({ error: "invalid_request" }, 400);
  const device = await authenticateDevice(request, environment, workspaceId, deviceId);
  if (!device) return json({ error: "unauthorized" }, 401);
  let command = await environment.DB.prepare(
    `SELECT relay_sequence, workspace_id, command_id, idempotency_key, envelope_digest, shop_id,
            member_id, device_id, envelope_json, state, expires_at, result_digest, result_json
       FROM connected_command WHERE workspace_id = ?1 AND command_id = ?2 AND device_id = ?3`,
  ).bind(workspaceId, commandId, deviceId).first<CommandRow>();
  if (!command || command.member_id !== device.member_id) return json({ error: "command_not_found" }, 404);
  if (command.state === "queued" && Date.parse(command.expires_at) <= Date.now()) {
    await environment.DB.prepare(
      `UPDATE connected_command SET state = 'expired', completed_at = CURRENT_TIMESTAMP
        WHERE workspace_id = ?1 AND command_id = ?2 AND state = 'queued'`,
    ).bind(workspaceId, commandId).run();
    command = { ...command, state: "expired" };
  }
  return json({
    commandId,
    state: command.state,
    relaySequence: command.relay_sequence,
    result: command.result_json ? JSON.parse(command.result_json) as unknown : null,
  });
}

async function revokeDevice(
  request: Request,
  environment: ConnectedWorkerEnvironment,
  deviceId: string,
): Promise<Response> {
  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const input = body as { workspaceId?: unknown; revocationEpoch?: unknown };
  if (!validIdentity(input.workspaceId) || !Number.isSafeInteger(input.revocationEpoch) || (input.revocationEpoch as number) < 1) {
    return json({ error: "invalid_request" }, 400);
  }
  if (!(await authenticateDesktop(request, environment, input.workspaceId))) return json({ error: "unauthorized" }, 401);
  const device = await environment.DB.prepare(
    "SELECT revocation_epoch, revoked_at FROM connected_device WHERE workspace_id = ?1 AND device_id = ?2",
  ).bind(input.workspaceId, deviceId).first<{ revocation_epoch: number; revoked_at: string | null }>();
  if (!device) return json({ error: "device_not_found" }, 404);
  if (input.revocationEpoch <= device.revocation_epoch) return json({ error: "revocation_epoch_conflict" }, 409);
  try {
    await environment.DB.batch([
      environment.DB.prepare(
        `UPDATE connected_device SET revoked_at = CURRENT_TIMESTAMP, revocation_epoch = ?1
          WHERE workspace_id = ?2 AND device_id = ?3`,
      ).bind(input.revocationEpoch, input.workspaceId, deviceId),
      environment.DB.prepare(
        "DELETE FROM connected_projection WHERE workspace_id = ?1 AND device_id = ?2",
      ).bind(input.workspaceId, deviceId),
      environment.DB.prepare(
        `UPDATE connected_command SET state = 'revoked', completed_at = CURRENT_TIMESTAMP
          WHERE workspace_id = ?1 AND device_id = ?2 AND state = 'queued'`,
      ).bind(input.workspaceId, deviceId),
    ]);
  } catch {
    return json({ error: "revocation_unavailable" }, 503);
  }
  return json({ deviceId, status: "revoked", revocationEpoch: input.revocationEpoch });
}

async function health(environment: ConnectedWorkerEnvironment): Promise<Response> {
  try {
    await environment.DB.prepare("SELECT workspace_id FROM connected_workspace LIMIT 1").first<{ workspace_id: string }>();
    await environment.DB.prepare("SELECT device_id FROM connected_device LIMIT 1").first<{ device_id: string }>();
    await environment.DB.prepare("SELECT command_id FROM connected_command LIMIT 1").first<{ command_id: string }>();
    parsedKeyring(environment.SF_LICENSE_TRIAL_PUBLIC_KEYS);
    parsedKeyring(environment.SF_LICENSE_PERMANENT_PUBLIC_KEYS);
    const productMajor = Number(environment.PRODUCT_MAJOR);
    if (!Number.isSafeInteger(productMajor) || productMajor < 1) throw new Error("invalid product major");
    return json({ status: "ok", protocolVersion: 1 });
  } catch {
    return json({ status: "unavailable" }, 503);
  }
}

export async function handleConnectedRequest(
  request: Request,
  environment: ConnectedWorkerEnvironment,
): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/healthz") return health(environment);
  if (request.method === "POST" && url.pathname === "/v1/bootstrap") return bootstrap(request, environment);
  if (request.method === "POST" && url.pathname === "/v1/desktop/pairings") return createPairing(request, environment);
  if (request.method === "POST" && url.pathname === "/v1/pairings/exchange") return exchangePairing(request, environment);
  if (request.method === "GET" && url.pathname === "/v1/desktop/authority") return workspaceAuthority(request, environment, url);
  if (request.method === "GET" && url.pathname === "/v1/desktop/devices") return listDevices(request, environment, url);
  if (request.method === "PUT" && url.pathname === "/v1/desktop/projections") return putProjection(request, environment);
  if (request.method === "GET" && url.pathname === "/v1/projections") return getProjection(request, environment, url);
  if (request.method === "POST" && url.pathname === "/v1/commands") return submitCommand(request, environment);
  if (request.method === "GET" && url.pathname === "/v1/desktop/commands") return pollCommands(request, environment, url);

  const resultMatch = /^\/v1\/desktop\/commands\/([A-Za-z0-9][A-Za-z0-9_-]{7,127})\/result$/.exec(url.pathname);
  if (request.method === "POST" && resultMatch?.[1]) return completeCommand(request, environment, resultMatch[1]);
  const commandMatch = /^\/v1\/commands\/([A-Za-z0-9][A-Za-z0-9_-]{7,127})$/.exec(url.pathname);
  if (request.method === "GET" && commandMatch?.[1]) return commandStatus(request, environment, commandMatch[1], url);
  const revokeMatch = /^\/v1\/desktop\/devices\/([A-Za-z0-9][A-Za-z0-9_-]{7,127})\/revoke$/.exec(url.pathname);
  if (request.method === "POST" && revokeMatch?.[1]) return revokeDevice(request, environment, revokeMatch[1]);
  return json({ error: "not_found" }, 404);
}

export default { fetch: handleConnectedRequest };
