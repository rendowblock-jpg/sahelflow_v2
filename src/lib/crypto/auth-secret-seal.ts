/**
 * AuthSecret record-bound sealing — Phase 4 protected-data authority.
 *
 * The `AuthSecret.pinHash` column is sealed at rest under the
 * purpose-separated "shop-secret" key with record-bound AEAD associated data,
 * mirroring the exact envelope pattern of `src/lib/secrets/index.ts` for the
 * `Secret` table. A stolen shop SQLite file therefore no longer carries a
 * directly brute-forceable PBKDF2 PIN hash (audit 7-d P2-4, threat model
 * S-010); only holders of the installation root + per-shop wrapped key can
 * verify PINs.
 *
 * RUST COORDINATION — `AuthSecret.secret` intentionally remains plaintext:
 * the native runtime (`src-tauri/src/packaged_auth.rs`) reads the raw
 * `AuthSecret.secret` column to inject the child process `AUTH_SECRET`
 * environment variable, and `/api/internal/runtime-ready` performs a
 * constant-time compare of that env value against the database column. Sealing
 * `secret` requires the Rust wave to open this envelope first (or move the
 * comparison behind a native bridge); once that lands the flip is
 * write-path-only — all three helpers already accept `"secret"` as a field
 * alongside `"pinHash"`.
 */
import "server-only";

import { ProtectedDataCorruptionError } from "@/lib/crypto/protected-data-error";
import { resolveShopProtectedKey } from "@/lib/crypto/protected-key-authority";
import { classifyProtectedValue } from "@/lib/crypto/protected-value-classification";
import {
  openProtectedString,
  sealProtectedString,
  type ShopRecordProtectedValueBinding,
} from "@/lib/crypto/protected-value";
import { processShopContext } from "@/lib/shops/context";

export type AuthSecretProtectedField = "pinHash" | "secret";

export const AUTH_SECRET_RECORD_ID = "default";

type AuthSecretKeyClient = Parameters<typeof resolveShopProtectedKey>[0];

function assertAuthSecretField(
  field: AuthSecretProtectedField,
): asserts field is AuthSecretProtectedField {
  if (field !== "pinHash" && field !== "secret") {
    throw new TypeError("AuthSecret protected field is invalid");
  }
}

function authSecretBinding(
  field: AuthSecretProtectedField,
): ShopRecordProtectedValueBinding {
  assertAuthSecretField(field);
  const context = processShopContext();
  return {
    scope: "shop-record",
    workspaceId: context.workspaceId,
    shopId: context.shopId,
    shopIncarnationId: context.shopIncarnationId,
    recordType: "AuthSecret",
    recordId: AUTH_SECRET_RECORD_ID,
    field,
  };
}

async function resolveAuthSecretAuthority(
  prisma: AuthSecretKeyClient,
  options: { createIfMissing: boolean },
) {
  return resolveShopProtectedKey(prisma, "shop-secret", {
    createIfMissing: options.createIfMissing,
  });
}

/**
 * Seal an AuthSecret value for storage. Already-canonical envelopes are
 * re-verified (fail-closed) and returned unchanged, so callers can seal
 * idempotently without re-encrypting authenticated values.
 */
export async function sealAuthSecretValue(
  prisma: AuthSecretKeyClient,
  field: AuthSecretProtectedField,
  value: string,
): Promise<string> {
  if (classifyProtectedValue(value) === "canonical") {
    await openAuthSecretValue(prisma, field, value);
    return value;
  }
  const authority = await resolveAuthSecretAuthority(prisma, {
    createIfMissing: true,
  });
  return sealProtectedString(
    value,
    authority.key,
    authority.descriptor,
    authSecretBinding(field),
  );
}

/**
 * Open a stored AuthSecret value. Sealed envelopes are unsealed fail-closed —
 * tampered, wrong-key or wrong-context values raise
 * `ProtectedDataCorruptionError` and callers must never substitute the stored
 * ciphertext or an empty value. Legacy pre-sealing plaintext (the pbkdf2
 * pinHash format or the historical plaintext secret) is returned as stored;
 * PBKDF2 verification semantics are untouched for that format.
 */
export async function openAuthSecretValue(
  prisma: AuthSecretKeyClient,
  field: AuthSecretProtectedField,
  value: string,
): Promise<string> {
  if (classifyProtectedValue(value) !== "canonical") {
    return value;
  }
  const authority = await resolveAuthSecretAuthority(prisma, {
    createIfMissing: false,
  });
  return openProtectedString(
    value,
    authority.key,
    authority.descriptor,
    authSecretBinding(field),
  );
}

/** True when the stored value is a canonical AuthSecret envelope. */
export function isSealedAuthSecretValue(
  field: AuthSecretProtectedField,
  value: string,
): boolean {
  assertAuthSecretField(field);
  return classifyProtectedValue(value) === "canonical";
}

/** Convenience re-export so callers can narrow corruption failures. */
export { ProtectedDataCorruptionError };
