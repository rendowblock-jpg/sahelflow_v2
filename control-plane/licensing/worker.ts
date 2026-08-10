import {
  LICENSE_ENTITLEMENT_DOMAIN,
  LICENSE_ENTITLEMENT_FORMAT,
  canonicalEntitlementBytes,
} from "../../src/lib/license/entitlement-canonical";
import type {
  EntitlementClaims,
  SignedEntitlement,
} from "../../src/lib/license/entitlement";

type D1Result<T> = { results?: T[]; success: boolean };
type D1Statement = {
  bind: (...values: unknown[]) => D1Statement;
  first: <T>() => Promise<T | null>;
  run: () => Promise<D1Result<unknown>>;
};
type D1Database = { prepare: (query: string) => D1Statement };

export type LicensingWorkerEnvironment = {
  DB: D1Database;
  TRIAL_RATE_LIMITER: {
    limit: (input: { key: string }) => Promise<{ success: boolean }>;
  };
  TRIAL_PRIVATE_KEY_PKCS8: string;
  SF_LICENSE_TRIAL_PUBLIC_KEYS: string;
  TRIAL_KEY_ID: string;
  PRODUCT_MAJOR: string;
  TRIAL_SHOP_SLOTS: string;
  TRIAL_MEMBER_LIMIT: string;
  TRIAL_BACKUP_BYTES: string;
};

type TrialRequest = {
  workspaceId: string;
  installationId: string;
  deviceBinding: string;
  appVersion: string;
};

type StoredTrial = {
  license_id: string;
  issued_at: string;
  expires_at: string;
};

type TrialConfiguration = Readonly<{
  productMajor: number;
  shopSlots: number;
  memberLimit: number;
  backupBytes: number;
  keyId: string;
}>;

const TRIAL_SCHEMA_HEALTH_QUERY =
  "SELECT device_binding, license_id, issued_at, expires_at FROM trial_entitlement LIMIT 1";
const TRIAL_SCHEMA_DEFINITION_QUERY =
  "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'trial_entitlement'";
const D1_WRITE_HEALTH_QUERY = `INSERT INTO licensing_readiness (probe_key, observed_at)
VALUES ('worker-health', CURRENT_TIMESTAMP)
ON CONFLICT(probe_key) DO UPDATE SET observed_at = excluded.observed_at`;
const TRIAL_KEY_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{7,127}$/;
const RATE_LIMITER_HEALTH_KEY = "health:licensing-readiness";
const SIGNER_HEALTH_CHALLENGE = new TextEncoder().encode(
  "sahelflow.licensing.signer-readiness.v1",
);

function json(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
}

function validRequest(value: unknown): value is TrialRequest {
  if (!value || typeof value !== "object") return false;
  const request = value as Partial<TrialRequest>;
  return (
    typeof request.workspaceId === "string" &&
    /^[0-9a-f]{32}$/i.test(request.workspaceId) &&
    typeof request.installationId === "string" &&
    /^[0-9a-f]{32}$/i.test(request.installationId) &&
    typeof request.deviceBinding === "string" &&
    /^sfdb1_[0-9a-f]{64}$/.test(request.deviceBinding) &&
    typeof request.appVersion === "string" &&
    /^\d+\.\d+\.\d+/.test(request.appVersion)
  );
}

function boundedPositiveInteger(
  value: string,
  label: string,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  const parsed = Number(value);
  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 1 ||
    parsed > maximum ||
    String(parsed) !== value
  ) {
    throw new Error(`${label} is invalid`);
  }
  return parsed;
}

function trialConfiguration(environment: LicensingWorkerEnvironment): TrialConfiguration {
  if (!TRIAL_KEY_ID_PATTERN.test(environment.TRIAL_KEY_ID)) {
    throw new Error("TRIAL_KEY_ID is invalid");
  }
  return {
    productMajor: boundedPositiveInteger(environment.PRODUCT_MAJOR, "PRODUCT_MAJOR", 1_000),
    shopSlots: boundedPositiveInteger(environment.TRIAL_SHOP_SLOTS, "TRIAL_SHOP_SLOTS", 1_000),
    memberLimit: boundedPositiveInteger(environment.TRIAL_MEMBER_LIMIT, "TRIAL_MEMBER_LIMIT", 25),
    backupBytes: boundedPositiveInteger(environment.TRIAL_BACKUP_BYTES, "TRIAL_BACKUP_BYTES"),
    keyId: environment.TRIAL_KEY_ID,
  };
}

function arrayBuffer(value: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(value.byteLength);
  new Uint8Array(copy).set(value);
  return copy;
}

function base64Bytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function bytesBase64(value: ArrayBuffer): string {
  const bytes = new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function publishedTrialPublicKey(environment: LicensingWorkerEnvironment): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(environment.SF_LICENSE_TRIAL_PUBLIC_KEYS);
  } catch {
    throw new Error("SF_LICENSE_TRIAL_PUBLIC_KEYS is not valid JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("SF_LICENSE_TRIAL_PUBLIC_KEYS must be a key-id object");
  }
  const value = (parsed as Record<string, unknown>)[environment.TRIAL_KEY_ID];
  if (typeof value !== "string") {
    throw new Error("TRIAL_KEY_ID is absent from SF_LICENSE_TRIAL_PUBLIC_KEYS");
  }
  return value;
}

async function importTrialPrivateKey(environment: LicensingWorkerEnvironment): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "pkcs8",
    arrayBuffer(base64Bytes(environment.TRIAL_PRIVATE_KEY_PKCS8)),
    { name: "Ed25519" },
    false,
    ["sign"],
  );
}

async function importTrialPublicKey(environment: LicensingWorkerEnvironment): Promise<CryptoKey> {
  const raw = base64Bytes(publishedTrialPublicKey(environment));
  if (raw.byteLength !== 32) {
    throw new Error("Published trial key must be exactly 32 Ed25519 bytes");
  }
  return crypto.subtle.importKey(
    "raw",
    arrayBuffer(raw),
    { name: "Ed25519" },
    false,
    ["verify"],
  );
}

async function assertTrialSignerIdentity(
  environment: LicensingWorkerEnvironment,
): Promise<CryptoKey> {
  const [privateKey, publicKey] = await Promise.all([
    importTrialPrivateKey(environment),
    importTrialPublicKey(environment),
  ]);
  const signature = await crypto.subtle.sign(
    { name: "Ed25519" },
    privateKey,
    arrayBuffer(SIGNER_HEALTH_CHALLENGE),
  );
  const matches = await crypto.subtle.verify(
    { name: "Ed25519" },
    publicKey,
    signature,
    arrayBuffer(SIGNER_HEALTH_CHALLENGE),
  );
  if (!matches) {
    throw new Error(
      "TRIAL_PRIVATE_KEY_PKCS8 does not match SF_LICENSE_TRIAL_PUBLIC_KEYS[TRIAL_KEY_ID]",
    );
  }
  return privateKey;
}

async function signTrial(claims: EntitlementClaims, signingKey: CryptoKey) {
  const signature = await crypto.subtle.sign(
    { name: "Ed25519" },
    signingKey,
    arrayBuffer(canonicalEntitlementBytes(claims)),
  );
  return bytesBase64(signature);
}

async function limitForKey(
  environment: LicensingWorkerEnvironment,
  key: string,
): Promise<{ success: boolean }> {
  const limiter = environment.TRIAL_RATE_LIMITER;
  if (!limiter || typeof limiter.limit !== "function") {
    throw new Error("TRIAL_RATE_LIMITER binding is unavailable");
  }
  const result = await limiter.limit({ key });
  if (!result || typeof result.success !== "boolean") {
    throw new Error("TRIAL_RATE_LIMITER returned an invalid result");
  }
  return result;
}

async function assertD1WriteReadiness(environment: LicensingWorkerEnvironment): Promise<void> {
  const result = await environment.DB.prepare(D1_WRITE_HEALTH_QUERY).run();
  if (!result?.success) {
    throw new Error("D1 licensing readiness write failed");
  }
}

async function issueTrial(
  request: TrialRequest,
  environment: LicensingWorkerEnvironment,
  now = new Date(),
): Promise<SignedEntitlement> {
  const configuration = trialConfiguration(environment);
  // Runtime issuance reuses the same signer-identity proof as readiness before
  // touching trial state. A stale or mismatched private signer therefore fails
  // closed instead of persisting a trial whose signature clients reject.
  const signingKey = await assertTrialSignerIdentity(environment);
  let stored = await environment.DB.prepare(
    "SELECT license_id, issued_at, expires_at FROM trial_entitlement WHERE device_binding = ?1",
  )
    .bind(request.deviceBinding)
    .first<StoredTrial>();
  if (!stored) {
    const issuedAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await environment.DB.prepare(
      `INSERT OR IGNORE INTO trial_entitlement
        (device_binding, license_id, issued_at, expires_at)
       VALUES (?1, ?2, ?3, ?4)`,
    )
      .bind(request.deviceBinding, `trial_${crypto.randomUUID()}`, issuedAt, expiresAt)
      .run();
    stored = await environment.DB.prepare(
      "SELECT license_id, issued_at, expires_at FROM trial_entitlement WHERE device_binding = ?1",
    )
      .bind(request.deviceBinding)
      .first<StoredTrial>();
  }
  if (!stored) throw new Error("trial entitlement was not persisted");

  const claims: EntitlementClaims = {
    domain: LICENSE_ENTITLEMENT_DOMAIN,
    formatVersion: LICENSE_ENTITLEMENT_FORMAT,
    licenseId: stored.license_id,
    workspaceId: request.workspaceId,
    installationId: request.installationId,
    deviceBinding: request.deviceBinding,
    productMajor: configuration.productMajor,
    type: "trial",
    issuedAt: stored.issued_at,
    expiresAt: stored.expires_at,
    supportEndsAt: stored.expires_at,
    shopSlots: configuration.shopSlots,
    memberLimit: configuration.memberLimit,
    deviceLimit: 1,
    backupBytes: configuration.backupBytes,
    mediaBytes: 0,
    features: ["sahelflow.complete"],
    transferState: "active",
    transferEpoch: 0,
    recoveryEpoch: 0,
    revocationEpoch: 0,
    keyId: configuration.keyId,
    issuer: "trial-service",
  };
  return {
    claims,
    signature: await signTrial(claims, signingKey),
  };
}

function normalizedSchemaSql(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function assertTrialSchemaDefinition(sql: string | null | undefined): void {
  if (!sql) throw new Error("trial_entitlement schema definition is unavailable");
  const normalized = normalizedSchemaSql(sql);
  for (const required of [
    "device_binding text primary key not null",
    "license_id text unique not null",
    "issued_at text not null",
    "expires_at text not null",
  ]) {
    if (!normalized.includes(required)) {
      throw new Error(`trial_entitlement schema is missing required authority: ${required}`);
    }
  }
}

async function health(environment: LicensingWorkerEnvironment): Promise<Response> {
  try {
    // Protect the public readiness surface before any D1, signer, or write work.
    // This quota is isolated from customer device keys and does not become
    // entitlement authority; it only bounds how often the expensive probe runs.
    const readinessLimit = await limitForKey(environment, RATE_LIMITER_HEALTH_KEY);
    if (!readinessLimit.success) {
      return new Response(JSON.stringify({ status: "rate_limited" }), {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          "Content-Security-Policy": "default-src 'none'",
          "Retry-After": "60",
        },
      });
    }

    await environment.DB.prepare(TRIAL_SCHEMA_HEALTH_QUERY).first<{
      device_binding: string;
      license_id: string;
      issued_at: string;
      expires_at: string;
    }>();

    const definition = await environment.DB.prepare(TRIAL_SCHEMA_DEFINITION_QUERY).first<{
      sql: string;
    }>();
    assertTrialSchemaDefinition(definition?.sql);

    trialConfiguration(environment);
    await assertTrialSignerIdentity(environment);

    await assertD1WriteReadiness(environment);

    return json({ status: "ok" });
  } catch {
    return json({ status: "unavailable" }, 503);
  }
}

export async function handleLicensingRequest(
  request: Request,
  environment: LicensingWorkerEnvironment,
): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/healthz") {
    return health(environment);
  }
  if (request.method !== "POST" || url.pathname !== "/v1/trials") {
    return json({ error: "not_found" }, 404);
  }
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  if (!validRequest(input)) return json({ error: "invalid_request" }, 400);
  try {
    const deviceLimit = await limitForKey(environment, `trial:${input.deviceBinding}`);
    if (!deviceLimit.success) {
      return new Response(JSON.stringify({ error: "rate_limited" }), {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          "Retry-After": "60",
        },
      });
    }
    return json(await issueTrial(input, environment));
  } catch {
    return json({ error: "issuance_unavailable" }, 503);
  }
}

export default {
  fetch: handleLicensingRequest,
};