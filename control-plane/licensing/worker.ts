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

function positiveInteger(value: string, label: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`${label} is invalid`);
  return parsed;
}

function arrayBuffer(value: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(value.byteLength);
  new Uint8Array(copy).set(value);
  return copy;
}

function base64Bytes(value: string): ArrayBuffer {
  const binary = atob(value);
  return arrayBuffer(
    Uint8Array.from(binary, (character) => character.charCodeAt(0)),
  );
}

function bytesBase64(value: ArrayBuffer): string {
  const bytes = new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function signTrial(claims: EntitlementClaims, environment: LicensingWorkerEnvironment) {
  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    base64Bytes(environment.TRIAL_PRIVATE_KEY_PKCS8),
    { name: "Ed25519" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    { name: "Ed25519" },
    privateKey,
    arrayBuffer(canonicalEntitlementBytes(claims)),
  );
  return bytesBase64(signature);
}

async function issueTrial(
  request: TrialRequest,
  environment: LicensingWorkerEnvironment,
  now = new Date(),
): Promise<SignedEntitlement> {
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
    productMajor: positiveInteger(environment.PRODUCT_MAJOR, "PRODUCT_MAJOR"),
    type: "trial",
    issuedAt: stored.issued_at,
    expiresAt: stored.expires_at,
    supportEndsAt: stored.expires_at,
    shopSlots: positiveInteger(environment.TRIAL_SHOP_SLOTS, "TRIAL_SHOP_SLOTS"),
    memberLimit: positiveInteger(environment.TRIAL_MEMBER_LIMIT, "TRIAL_MEMBER_LIMIT"),
    deviceLimit: 1,
    backupBytes: positiveInteger(environment.TRIAL_BACKUP_BYTES, "TRIAL_BACKUP_BYTES"),
    mediaBytes: 0,
    features: ["sahelflow.complete"],
    transferState: "active",
    transferEpoch: 0,
    recoveryEpoch: 0,
    revocationEpoch: 0,
    keyId: environment.TRIAL_KEY_ID,
    issuer: "trial-service",
  };
  return {
    claims,
    signature: await signTrial(claims, environment),
  };
}

export async function handleLicensingRequest(
  request: Request,
  environment: LicensingWorkerEnvironment,
): Promise<Response> {
  const url = new URL(request.url);
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
    const deviceLimit = await environment.TRIAL_RATE_LIMITER.limit({
      key: `trial:${input.deviceBinding}`,
    });
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
