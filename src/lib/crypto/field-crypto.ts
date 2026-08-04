/**
 * Legacy field-level cryptography — AES-256-GCM for existing secrets and PII.
 *
 * New protected values use the contextual envelope in `protected-value.ts`.
 * This module remains the compatibility codec until the Phase 4 protected-data
 * migration rewrites existing rows. A malformed or unauthentic legacy payload
 * becomes an explicit corruption error; callers must never substitute the raw
 * stored ciphertext or a blind index as if it were seller plaintext.
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHmac,
  timingSafeEqual,
} from "node:crypto";

import { ProtectedDataCorruptionError } from "@/lib/crypto/protected-data-error";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const KEY_LENGTH = 32;
const TAG_LENGTH = 16;

/** Legacy random-IV payload retained as a migration input. */
export interface EncryptedPayload {
  iv: string;
  ciphertext: string;
  tag: string;
}

/**
 * Shape detector only. Authentication still occurs in `decryptString`; callers
 * must not treat this predicate as proof that the payload is valid ciphertext.
 */
export function isEncryptedPayload(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    const parsed = JSON.parse(value) as Partial<EncryptedPayload>;
    return (
      typeof parsed.iv === "string" &&
      typeof parsed.ciphertext === "string" &&
      typeof parsed.tag === "string"
    );
  } catch {
    return false;
  }
}

export function encryptString(plaintext: string, key: Buffer): EncryptedPayload {
  assertKeyLength(key);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return {
    iv: iv.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

function decodeCanonicalBase64(
  value: string,
  label: string,
  expectedLength?: number,
): Buffer {
  if (
    value !== "" &&
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value,
    )
  ) {
    throw new ProtectedDataCorruptionError(
      "format",
      `${label} is not canonical base64`,
    );
  }
  const decoded = Buffer.from(value, "base64");
  if (
    decoded.toString("base64") !== value ||
    (expectedLength !== undefined && decoded.length !== expectedLength)
  ) {
    throw new ProtectedDataCorruptionError(
      "format",
      `${label} has invalid dimensions`,
    );
  }
  return decoded;
}

/**
 * Decrypt one legacy payload. Format and authentication failures are typed so
 * service/API layers can enter recovery state without leaking raw stored data.
 */
export function decryptString(payload: EncryptedPayload, key: Buffer): string {
  assertKeyLength(key);
  const iv = decodeCanonicalBase64(payload.iv, "Legacy protected IV", IV_LENGTH);
  const ciphertext = decodeCanonicalBase64(
    payload.ciphertext,
    "Legacy protected ciphertext",
  );
  const tag = decodeCanonicalBase64(
    payload.tag,
    "Legacy protected tag",
    TAG_LENGTH,
  );
  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
      "utf8",
    );
  } catch (cause) {
    throw new ProtectedDataCorruptionError(
      "authentication",
      "Legacy protected value failed authentication",
      cause,
    );
  }
}

/**
 * Legacy deterministic blind index. Phase 4 migrates callers to a separately
 * wrapped blind-index key rather than deriving indexes from the data key.
 */
export function deriveBlindIndex(value: string, key: Buffer): string {
  assertKeyLength(key);
  return createHmac("sha256", key)
    .update(value.trim().toLowerCase())
    .digest("hex");
}

export function timingSafeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function assertKeyLength(key: Buffer): void {
  if (!Buffer.isBuffer(key) || key.length !== KEY_LENGTH) {
    throw new TypeError(
      `Protected key must be ${KEY_LENGTH} bytes (256-bit). Got ${key.length} bytes.`,
    );
  }
}

export const CRYPTO_META = {
  algorithm: ALGORITHM,
  keyLengthBits: KEY_LENGTH * 8,
  ivLength: IV_LENGTH,
  tagLength: TAG_LENGTH,
  legacyFormat: true,
} as const;
