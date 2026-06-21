/**
 * Field-level cryptography — AES-256-GCM for secrets & PII at rest.
 *
 * ARCHITECTURE (ADR-003, decided):
 *   Prisma's built-in SQLite driver does NOT support SQLCipher (the `?key=`
 *   connection param is silently ignored). Rather than migrate the working
 *   19-model schema to Drizzle/raw better-sqlite3 (high-risk, low marginal
 *   benefit mid-build), we encrypt sensitive fields at the application layer.
 *
 *   - Random-IV AES-256-GCM for secrets & non-searchable PII (names, addresses, notes, API keys).
 *   - Deterministic HMAC-SHA256 "blind index" for fields that must remain
 *     searchable by exact equality (e.g. customer phone). The blind index is
 *     stored alongside the ciphertext so `WHERE phoneIndex = ?` lookups work
 *     without ever decrypting.
 *
 * THREAT MODEL: protects the SQLite file at rest (laptop stolen, file copied).
 * The master key lives in a separate mode-600 keyfile (later: OS keychain via
 * Tauri Stronghold). Key + ciphertext are never co-located.
 *
 * NOT a threat model: an attacker with live memory access, or an attacker who
 * also has the master key file. For those, use full-disk encryption + OS auth.
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHmac,
  timingSafeEqual,
} from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit IV — the GCM standard
const KEY_LENGTH = 32; // 256-bit key
const TAG_LENGTH = 16;

/** A random-IV encrypted payload. Safe for secrets & non-searchable PII. */
export interface EncryptedPayload {
  /** base64 — 12-byte initialization vector */
  iv: string;
  /** base64 — ciphertext */
  ciphertext: string;
  /** base64 — 16-byte GCM auth tag */
  tag: string;
}

/**
 * Encrypt a string with AES-256-GCM and a fresh random IV.
 * Each call produces a different ciphertext (non-deterministic).
 */
export function encryptString(plaintext: string, key: Buffer): EncryptedPayload {
  assertKeyLength(key);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    tag: tag.toString("base64"),
  };
}

/**
 * Decrypt an EncryptedPayload. Throws if the auth tag doesn't verify
 * (tamper detection) — callers should catch and treat as "corrupt/invalid".
 */
export function decryptString(payload: EncryptedPayload, key: Buffer): string {
  assertKeyLength(key);
  const iv = Buffer.from(payload.iv, "base64");
  const ciphertext = Buffer.from(payload.ciphertext, "base64");
  const tag = Buffer.from(payload.tag, "base64");
  if (iv.length !== IV_LENGTH) {
    throw new Error(`Invalid IV length: expected ${IV_LENGTH}, got ${iv.length}`);
  }
  if (tag.length !== TAG_LENGTH) {
    throw new Error(`Invalid auth tag length: expected ${TAG_LENGTH}, got ${tag.length}`);
  }
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/**
 * Derive a deterministic blind index for a searchable field (e.g. phone).
 * Returns a 64-char hex string. The SAME input + key always yields the SAME
 * index, enabling `WHERE phoneIndex = deriveBlindIndex(phone, key)` lookups
 * without decrypting every row. The index does NOT reveal the plaintext
 * (HMAC is one-way).
 */
export function deriveBlindIndex(value: string, key: Buffer): string {
  assertKeyLength(key);
  // Normalize: trim + lowercase so " 0555 " matches "0555"
  const normalized = value.trim().toLowerCase();
  return createHmac("sha256", key).update(normalized).digest("hex");
}

/** Constant-time comparison of two strings of equal length. */
export function timingSafeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function assertKeyLength(key: Buffer): void {
  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `Master key must be ${KEY_LENGTH} bytes (256-bit). Got ${key.length} bytes.`,
    );
  }
}

export const CRYPTO_META = {
  algorithm: ALGORITHM,
  keyLengthBits: KEY_LENGTH * 8,
  ivLength: IV_LENGTH,
  tagLength: TAG_LENGTH,
} as const;
