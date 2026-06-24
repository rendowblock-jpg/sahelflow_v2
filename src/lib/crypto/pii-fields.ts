/**
 * Generic in-place field encryption for non-searchable PII (ADR-003).
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
export function encryptPiiFields(
  data: Record<string, unknown>,
  fields: readonly string[],
  key?: Buffer,
): Record<string, unknown> {
  const masterKey = key ?? getMasterKey();
  const out: Record<string, unknown> = { ...data };

  for (const field of fields) {
    if (!(field in out)) continue;
    const value = out[field];
    if (value === null || value === undefined) {
      // nullable field set to null — keep null
      continue;
    }
    if (typeof value !== "string") {
      throw new Error(
        `Field "${field}" must be a string (got ${typeof value}). Encrypt path.`,
      );
    }
    // If already encrypted (re-save scenario), leave as-is
    if (isEncryptedPayload(value)) continue;
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
 * - Tampered ciphertext → decrypt fails silently (raw value preserved, no crash).
 *   This makes corruption visible without taking down the whole list view.
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
    try {
      out[field] = decryptString(jsonToPayload(value), masterKey);
    } catch {
      // Tampered or wrong key — leave the raw value so corruption is visible.
      // Better than crashing the whole list.
    }
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
export const CONVERSATION_PII_FIELDS = ["contactName", "contactPhone"] as const;

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
