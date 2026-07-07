/**
 * PII redaction for JSON snapshots (Session 30, AUDIT-4 D6).
 *
 * AuditLog.before/after/metadata, OrderChange.payload, and
 * AiChatMessage.toolCalls all store JSON that can contain plaintext
 * customer PII (phone, address, notes). This module provides:
 *
 *   - redactPii(obj) → deep-clones obj, replacing sensitive fields with
 *     "[REDACTED]" so the audit trail is useful without leaking PII.
 *
 * The list of sensitive keys is conservative — if in doubt, redact.
 * Phone numbers are also detected by regex anywhere in string values
 * (covers cases where the field name isn't "phone" but the value is).
 *
 * Used by: src/lib/audit.ts, src/lib/data/order-change-service.ts,
 * src/lib/ai/chat/agent.ts (tool result persistence).
 */

/** Keys whose values should always be redacted. */
const SENSITIVE_KEYS = new Set([
  "phone",
  "phoneBlindIndex",
  "address",
  "addressLine",
  "addressLine1",
  "addressLine2",
  "notes",
  "note",
  "deliveryNotes",
  "messageBody",
  "body",
  "rawMessage",
  "raw",
  "name",
  "customerName",
  "fullName",
  "firstName",
  "lastName",
  "email",
  "password",
  "apiToken",
  "apiKey",
  "accessToken",
  "consumerSecret",
  "secret",
  "credentials",
  "token",
]);

/**
 * Regex: matches Algerian phone numbers.
 * Algerian mobile/landline format: 0X XX XX XX XX (10 digits total).
 * Examples: 0555 12 34 56, 0555123456, 021 12 34 56
 */
const PHONE_REGEX = /\b0\d(?:\s?\d{2}){4}\b/g;

/**
 * Regex: matches international +213 format.
 * +213 X XX XX XX XX (drops the leading 0, country code instead).
 * Examples: +213 555 12 34 56, +213555123456
 */
const INT_PHONE_REGEX = /\+213\s?\d(?:\s?\d{2}){4}/g;

/**
 * Deep-clone + redact sensitive fields in any JSON-serializable value.
 * Returns a new object; does not mutate the input.
 */
export function redactPii<T>(value: T): T {
  return redactRecursive(value) as T;
}

function redactRecursive(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    // Redact phone numbers embedded in strings
    return value
      .replace(PHONE_REGEX, "[PHONE]")
      .replace(INT_PHONE_REGEX, "[PHONE]");
  }
  if (Array.isArray(value)) {
    return value.map(redactRecursive);
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      // SV-L3: previously only the FIRST char was lowercased, so keys like
      // "PHONE", "EMAIL", "API_KEY" (all-caps) never matched the
      // SENSITIVE_KEYS set (which is lowercase). Lowercase the WHOLE key.
      const lowerK = k.toLowerCase();
      if (SENSITIVE_KEYS.has(lowerK)) {
        out[k] = redactScalar(v);
      } else {
        out[k] = redactRecursive(v);
      }
    }
    return out;
  }
  return value;
}

/** Redact a scalar/leaf value: keep type info, drop content. */
function redactScalar(v: unknown): unknown {
  if (v === null || v === undefined) return v;
  if (typeof v === "string") return v.length > 0 ? "[REDACTED]" : v;
  if (typeof v === "number") return v; // counts/amounts OK
  if (typeof v === "boolean") return v;
  if (Array.isArray(v)) return v.map(redactScalar);
  if (typeof v === "object") return redactRecursive(v);
  return "[REDACTED]";
}
