/**
 * Generic in-place field encryption for non-searchable PII (ADR-003).
 *
 * STATUS (audit 7-d P3-9): scripts-only compatibility module. No production
 * `src/` importer remains; it stays type-checked solely for the ADR-003
 * legacy-generation migration toolchain (scripts/db.ts,
 * scripts/migrate-pii-encryption.ts). Do not wire this into new Prisma
 * extensions — the canonical protected-data authority is
 * protected-pii.ts / with-protected-pii.ts.
 *
 * Used by Order (phone, address, notes) and Conversation (contactName,
 * contactPhone). For searchable PII (Customer.phone), use customer-encryption.ts
 * which implements the blind-index + companion-ciphertext pattern.
 *
 * DESIGN
 *   Each field is stored as a random-IV AES-256-GCM JSON payload in the SAME
 *   column it occupied as plaintext. No schema change is required — the column
 *   holds either plaintext (legacy / pre-migration) or ciphertext (detected by
 *   shape via `isEncryptedPayload`). The Prisma extension in src/lib/db.ts
 *   encrypts on write and decrypts on read, so call sites pass plaintext and
 *   get plaintext back. The encryption is fully transparent.
 *
 *   Non-searchable means: the app never does `WHERE phone = ?` on these fields.
 *   If a future feature needs equality search on e.g. Order.phone, it must be
 *   migrated to the blind-index pattern (see customer-encryption.ts).
 *
 * THREAT MODEL: same as field-crypto.ts — protects the SQLite file at rest.
 */

import {
  encryptString,
  decryptString,
  isEncryptedPayload,
  deriveBlindIndex,
  type EncryptedPayload,
} from "@/lib/crypto/field-crypto";
import { getMasterKey } from "@/lib/crypto/master-key";
import type { Buffer } from "buffer";

/** Serialize an EncryptedPayload to its JSON string form (for DB storage). */
function payloadToJson(payload: EncryptedPayload): string {
  return JSON.stringify(payload);
}

/** Parse a JSON string back to an EncryptedPayload. Throws on malformed input. */
function jsonToPayload(json: string): EncryptedPayload {
  const parsed = JSON.parse(json) as Partial<EncryptedPayload>;
  if (
    !parsed.iv ||
    !parsed.ciphertext ||
    !parsed.tag ||
    typeof parsed.iv !== "string" ||
    typeof parsed.ciphertext !== "string" ||
    typeof parsed.tag !== "string"
  ) {
    throw new Error("Malformed encrypted payload");
  }
  return {
    iv: parsed.iv,
    ciphertext: parsed.ciphertext,
    tag: parsed.tag,
  };
}

// ── Write path: encrypt caller plaintext → DB ciphertext ───────────────────

/**
 * Transform a caller-provided `data` object (for create/update/upsert) into
 * the DB shape: encrypt the listed PII fields in place.
 *
 * - Only touches fields that are present in `data` (partial updates are safe).
 * - Null/undefined nullable fields are passed through (stored as null).
 * - Already-encrypted values are left as-is (idempotent — safe for re-saves).
 * - Non-string values throw (PII fields must be strings).
 *
 * @param data   The caller-provided data object (create/update/upsert payload).
 * @param fields The PII field names to encrypt (e.g. ORDER_PII_FIELDS).
 * @param key    Optional master key (cached in-process if omitted).
 */
export interface BlindIndexConfig {
  sourceField: string;   // the PII field to index (e.g. "phone")
  indexField: string;    // the column to store the blind index (e.g. "phoneBlindIndex")
  normalize?: (v: string) => string;  // optional normalization (e.g. toLowerCase)
}

export function encryptPiiFields(
  data: Record<string, unknown>,
  fields: readonly string[],
  key?: Buffer,
  blindIndex?: BlindIndexConfig,
): Record<string, unknown> {
  const masterKey = key ?? getMasterKey();
  const out: Record<string, unknown> = { ...data };

  for (const field of fields) {
    if (!(field in out)) continue;
    const value = out[field];
    if (value === null || value === undefined) {
      continue;
    }
    if (typeof value !== "string") {
      throw new Error(
        `Field "${field}" must be a string (got ${typeof value}). Encrypt path.`,
      );
    }
    if (isEncryptedPayload(value)) continue;
    // SEC-009: compute blind index for the source field (if configured)
    if (blindIndex && field === blindIndex.sourceField) {
      const normalized = blindIndex.normalize ? blindIndex.normalize(value) : value;
      out[blindIndex.indexField] = deriveBlindIndex(normalized, masterKey);
    }
    out[field] = payloadToJson(encryptString(value, masterKey));
  }

  return out;
}

// ── Read path: decrypt DB ciphertext → caller plaintext ────────────────────

/**
 * Decrypt a single result row (from findMany/findUnique/findFirst) back to the
 * caller shape: decrypt the listed PII fields in place.
 *
 * - Skips fields that are absent (partial selects are safe).
 * - Skips fields that are null or undefined.
 * - Skips fields that are already plaintext (not an encrypted payload).
 * - Fail closed (audit 7-d P3-9): a tampered or wrong-key legacy payload
 *   propagates the ProtectedDataCorruptionError from field-crypto.ts instead
 *   of silently substituting raw ciphertext as if it were seller plaintext.
 *
 * @param row    The raw DB row.
 * @param fields The PII field names to decrypt.
 * @param key    Optional master key (cached in-process if omitted).
 */
export function decryptPiiRow(
  row: Record<string, unknown>,
  fields: readonly string[],
  key?: Buffer,
): Record<string, unknown> {
  const masterKey = key ?? getMasterKey();
  const out: Record<string, unknown> = { ...row };

  for (const field of fields) {
    if (!(field in out)) continue;
    const value = out[field];
    if (value === null || value === undefined) continue;
    if (typeof value !== "string") continue;
    if (!isEncryptedPayload(value)) continue; // already plaintext
    // No try/catch: an unauthentic legacy payload must fail closed with the
    // ProtectedDataCorruptionError, matching field-crypto.ts semantics.
    out[field] = decryptString(jsonToPayload(value), masterKey);
  }

  return out;
}

// ── Model-specific configs ─────────────────────────────────────────────────

/**
 * PII fields on the Order model (non-searchable, encrypted in place).
 *
 *   phone    — delivery contact phone (often = customer phone, but stored
 *              separately because the order may ship to a different person)
 *   address  — delivery address (street-level, high-sensitivity PII)
 *   notes    — free-text, may contain PII (delivery instructions, gate codes)
 *
 * `sourceMetadata` is NOT encrypted — it's structured JSON (WhatsApp message
 * ID, storefront slug, etc.), not free-text PII. `wilaya` and `commune` are
 * reference data from a fixed list (58 wilayas / 1,541 communes) used for
 * analytics + filtering, so they stay plaintext.
 */
export const ORDER_PII_FIELDS = ["phone", "address", "notes"] as const;

/**
 * PII fields on the Conversation model (non-searchable, encrypted in place).
 *
 *   contactName   — the WhatsApp/TikTok contact's display name
 *   contactPhone  — the contact's phone number (nullable — some channels don't
 *                   expose it, e.g. TikTok DMs)
 *
 * Conversations are looked up by id, channel, or sourceId — never by contact
 * name/phone. If a future feature needs "find conversation by phone", it must
 * migrate to the blind-index pattern.
 */
export const CONVERSATION_PII_FIELDS = [
  "contactName",
  "contactPhone",
  "draftBody",
] as const;

/**
 * PII fields on the Message model (non-searchable, encrypted in place).
 *
 *   body — the WhatsApp message content (customer's order details, address,
 *          personal info, etc.). This is the most sensitive PII in the app —
 *          it contains whatever the customer typed in their messages.
 *
 * Messages are looked up by id, conversationId, or createdAt — never by body
 * content. Encryption is transparent (call sites pass plaintext, get plaintext).
 *
 * S-010: WhatsApp history was previously stored in plaintext. This encrypts it
 * at rest so a stolen SQLite file can't reveal customer conversations.
 */
export const MESSAGE_PII_FIELDS = ["body"] as const;
