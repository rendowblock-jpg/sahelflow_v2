/**
 * Secrets service — encrypted key/value store backed by the `Secret` Prisma model.
 *
 * Used for third-party API keys (Gemini, delivery providers, e-commerce) and
 * any other small secret the app needs at runtime. Values are AES-256-GCM
 * encrypted with the master key before hitting SQLite.
 *
 * Per ADR-004 (amended): the interim store is this encrypted SQLite table;
 * the production target is Tauri Stronghold / OS keychain. The interface here
 * (getSecret / setSecret / hasSecret / deleteSecret) stays the same when the
 * backing store changes — only the implementation swaps.
 *
 * Well-known secret keys (convention: snake_case):
 *   - "gemini_api_key"          — Google AI Studio key for order extraction
 *   - "yalidine_api_token"      — (future) Yalidine delivery API
 *   - "zrexpress_api_key"       — (future) ZR Express delivery API
 *   - "maystro_api_token"       — (future) Maystro delivery API
 */

import { db } from "@/lib/db";
import {
  encryptString,
  decryptString,
  type EncryptedPayload,
} from "@/lib/crypto/field-crypto";
import { getMasterKey } from "@/lib/crypto/master-key";

export interface SecretRow {
  key: string;
  ciphertext: string;
  iv: string;
  tag: string;
  createdAt: Date;
  updatedAt: Date;
}

function rowToPayload(row: SecretRow): EncryptedPayload {
  return { iv: row.iv, ciphertext: row.ciphertext, tag: row.tag };
}

/** Get a decrypted secret value, or null if it doesn't exist. */
export async function getSecret(key: string): Promise<string | null> {
  const row = await db.secret.findUnique({ where: { key } });
  if (!row) return null;
  return decryptString(rowToPayload(row), getMasterKey());
}

/** True if a secret is configured for this key (no decryption — cheap check). */
export async function hasSecret(key: string): Promise<boolean> {
  const row = await db.secret.findUnique({
    where: { key },
    select: { id: true },
  });
  return row !== null;
}

/** Set (upsert) a secret. The value is encrypted before storage. */
export async function setSecret(key: string, value: string): Promise<void> {
  const payload = encryptString(value, getMasterKey());
  await db.secret.upsert({
    where: { key },
    create: { key, ...payload },
    update: { ...payload },
  });
}

/** Delete a secret. No-op if it doesn't exist. */
export async function deleteSecret(key: string): Promise<void> {
  await db.secret.deleteMany({ where: { key } });
}

/**
 * List configured secret keys (without values) — for UI status display.
 * Returns the well-known keys with a boolean `configured` flag.
 */
export async function listSecretStatus(
  knownKeys: readonly string[],
): Promise<Record<string, boolean>> {
  const rows = await db.secret.findMany({
    where: { key: { in: [...knownKeys] } },
    select: { key: true },
  });
  const present = new Set(rows.map((r) => r.key));
  const out: Record<string, boolean> = {};
  for (const k of knownKeys) out[k] = present.has(k);
  return out;
}
