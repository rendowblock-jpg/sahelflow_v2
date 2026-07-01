/**
 * Customer PII encryption — application-layer transparent encryption for the
 * Customer model (ADR-003).
 *
 * FIELD MAP
 *   name, phone2, address, notes → stored as AES-256-GCM JSON payloads
 *                                  (random IV, non-deterministic) in their own
 *                                  columns. Decrypted in place on read.
 *   phone                        → stored as an HMAC blind index (deterministic,
 *                                  searchable, @unique). The plaintext phone is
 *                                  encrypted into the companion `phoneEnc`
 *                                  column. On read, `phoneEnc` is decrypted and
 *                                  surfaced as `phone` (the blind index is
 *                                  never exposed to callers).
 *   wilaya, commune              → plaintext (reference data from a fixed list
 *                                  of 58 wilayas / 1,541 communes; used for
 *                                  analytics + filtering).
 *
 * The Prisma extension in src/lib/db.ts wires these helpers into customer
 * create/update/upsert/find* so that call sites pass plaintext and get
 * plaintext back — the encryption is fully transparent.
 */

import {
  encryptString,
  decryptString,
  deriveBlindIndex,
  isEncryptedPayload,
  type EncryptedPayload,
} from "@/lib/crypto/field-crypto";
import { getMasterKey } from "@/lib/crypto/master-key";
import type { Buffer } from "buffer";

// Re-export for backward compat (callers that imported isEncryptedPayload from
// customer-encryption). The canonical home is now field-crypto.ts.
export { isEncryptedPayload };

/** Fields stored as random-IV AES-256-GCM JSON in their own column. */
export const ENCRYPTED_FIELDS = ["name", "phone2", "address", "notes"] as const;
export type EncryptedField = (typeof ENCRYPTED_FIELDS)[number];

/** The searchable field — stored as an HMAC blind index. */
export const BLIND_INDEX_FIELD = "phone" as const;
/** The companion column holding the encrypted actual phone. */
export const PHONE_ENC_FIELD = "phoneEnc" as const;

/** All PII fields that callers pass as plaintext (input shape). */
export const PLAINTEXT_PII_FIELDS = [
  "name",
  "phone",
  "phone2",
  "address",
  "notes",
] as const;

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
 * the DB shape: encrypt PII fields, derive the phone blind index, set phoneEnc.
 *
 * - Only touches fields that are present in `data` (partial updates are safe).
 * - Null/undefined nullable fields are passed through (stored as null).
 * - `phone` (plaintext) → `phone` (blind index) + `phoneEnc` (encrypted).
 * - The master key is loaded once per call (cached in-process).
 */
export function encryptCustomerData(
  data: Record<string, unknown>,
  key?: Buffer,
): Record<string, unknown> {
  const masterKey = key ?? getMasterKey();
  const out: Record<string, unknown> = { ...data };

  // Encrypt the scalar PII fields (name, phone2, address, notes)
  for (const field of ENCRYPTED_FIELDS) {
    if (!(field in out)) continue;
    const value = out[field];
    if (value === null || value === undefined) {
      // nullable field set to null — keep null
      continue;
    }
    if (typeof value !== "string") {
      throw new Error(
        `Customer.${field} must be a string (got ${typeof value}). Encrypt path.`,
      );
    }
    // If already encrypted (re-save scenario), leave as-is
    if (isEncryptedPayload(value)) continue;
    // SEC-009: compute name blind index for exact-match name search
    if (field === "name") {
      out["nameBlindIndex"] = deriveBlindIndex(value.toLowerCase().trim(), masterKey);
    }
    out[field] = payloadToJson(encryptString(value, masterKey));
  }

  // phone: plaintext → blind index (phone) + encrypted actual (phoneEnc)
  if (BLIND_INDEX_FIELD in out) {
    const phoneValue = out[BLIND_INDEX_FIELD];
    if (phoneValue === null || phoneValue === undefined) {
      throw new Error("Customer.phone cannot be null (it is the blind index key)");
    }
    if (typeof phoneValue !== "string") {
      throw new Error(
        `Customer.phone must be a string (got ${typeof phoneValue}). Encrypt path.`,
      );
    }
    // If already a blind index (64 hex), assume re-save and leave as-is
    if (!/^[0-9a-f]{64}$/.test(phoneValue)) {
      out[BLIND_INDEX_FIELD] = deriveBlindIndex(phoneValue, masterKey);
      out[PHONE_ENC_FIELD] = payloadToJson(encryptString(phoneValue, masterKey));
    }
  }

  return out;
}

// ── Read path: decrypt DB ciphertext → caller plaintext ────────────────────

/**
 * Decrypt a single customer row (from findMany/findUnique/findFirst) back to
 * the caller shape: decrypt PII fields in place, decrypt phoneEnc → phone,
 * strip phoneEnc from the result.
 *
 * - Skips fields that are absent (partial selects are safe).
 * - Skips fields that are null or already plaintext.
 * - If phoneEnc is absent but phone is a blind index, `phone` is left as the
 *   blind index (callers should select phoneEnc when they select phone; the
 *   extension enforces this).
 */
export function decryptCustomerRow(
  row: Record<string, unknown>,
  key?: Buffer,
): Record<string, unknown> {
  const masterKey = key ?? getMasterKey();
  const out: Record<string, unknown> = { ...row };

  // Decrypt scalar PII fields
  for (const field of ENCRYPTED_FIELDS) {
    if (!(field in out)) continue;
    const value = out[field];
    if (value === null || value === undefined) continue;
    if (typeof value !== "string") continue;
    if (!isEncryptedPayload(value)) continue; // already plaintext
    try {
      out[field] = decryptString(jsonToPayload(value), masterKey);
    } catch {
      // Tampered or wrong key — leave as-is so the caller sees the raw value
      // and can detect corruption. Better than crashing the whole list.
    }
  }

  // phone: decrypt phoneEnc → phone, strip phoneEnc
  if (PHONE_ENC_FIELD in out) {
    const encValue = out[PHONE_ENC_FIELD];
    if (typeof encValue === "string" && isEncryptedPayload(encValue)) {
      try {
        out[BLIND_INDEX_FIELD] = decryptString(jsonToPayload(encValue), masterKey);
      } catch {
        // leave phone as the blind index
      }
    }
    delete out[PHONE_ENC_FIELD];
  }

  return out;
}

// ── Where path: rewrite caller plaintext → blind index ─────────────────────

/**
 * Rewrite a `where` clause: if `where.phone` is a plaintext phone, replace it
 * with the blind index. Throws if the caller uses a non-equality filter on
 * phone (substring/contains is not supported on blind indexes).
 */
export function rewriteCustomerWhere(
  where: unknown,
  key?: Buffer,
): unknown {
  if (!where || typeof where !== "object") return where;
  const masterKey = key ?? getMasterKey();
  const w = where as Record<string, unknown>;
  if (!(BLIND_INDEX_FIELD in w)) return where;

  const phoneValue = w[BLIND_INDEX_FIELD];
  if (phoneValue === null || phoneValue === undefined) return where;
  if (typeof phoneValue === "string") {
    // Already a blind index (64 hex) — leave as-is
    if (/^[0-9a-f]{64}$/.test(phoneValue)) return where;
    // Plain equality — hash it
    w[BLIND_INDEX_FIELD] = deriveBlindIndex(phoneValue, masterKey);
    return w;
  }
  if (typeof phoneValue === "object") {
    // Prisma filter object (e.g. { contains: "..." }) — not supported on blind indexes
    throw new Error(
      "Customer.phone supports only exact-equality lookups. Substring/prefix search " +
        "is not supported because the field is stored as a blind index (ADR-003).",
    );
  }
  return where;
}

// ── Select path: ensure phoneEnc is fetched when phone is ──────────────────

/**
 * If a query selects `phone` but not `phoneEnc`, add `phoneEnc` so the read
 * path can decrypt. Returns the (possibly modified) args select/include.
 */
export function ensurePhoneEncSelected(args: {
  select?: Record<string, boolean>;
  include?: Record<string, boolean>;
}): { select?: Record<string, boolean>; include?: Record<string, boolean> } {
  if (args.select) {
    if (args.select[BLIND_INDEX_FIELD] && !args.select[PHONE_ENC_FIELD]) {
      return {
        ...args,
        select: { ...args.select, [PHONE_ENC_FIELD]: true },
      };
    }
  } else if (args.include) {
    // include: true fetches all scalar fields → phoneEnc is already included.
    // If include selectively lists phone, add phoneEnc too.
    if (
      BLIND_INDEX_FIELD in args.include &&
      !(PHONE_ENC_FIELD in args.include)
    ) {
      return {
        ...args,
        include: { ...args.include, [PHONE_ENC_FIELD]: true },
      };
    }
  }
  return args;
}
