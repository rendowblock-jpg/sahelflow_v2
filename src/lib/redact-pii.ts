/**
 * PII redaction for JSON snapshots (Session 30, AUDIT-4 D6).
 *
 * AuditLog.before/after/metadata, OrderChange.payload, and
 * AiChatMessage.toolCalls all store JSON that can contain plaintext
 * customer PII (phone, address, notes). This module provides:
 *
 *   - redactPii(obj) → deep-clones obj, replacing sensitive fields with
 *     "[REDACTED]" so the audit trail is useful without leaking PII.
 *   - redactError(err) → returns a NEW Error with message/stack PII-scrubbed
 *     (W3-24: prevents customer phone/email from leaking to Sentry via
 *     Prisma errors, validation messages, etc.).
 *
 * The list of sensitive keys is conservative — if in doubt, redact.
 * Phone numbers AND emails are also detected by regex anywhere in string
 * values (covers cases where the field name isn't "phone"/"email" but the
 * value is — e.g. a Prisma error message like "Unique constraint failed on
 * (phone): 0555123456").
 *
 * Used by: src/lib/audit.ts, src/lib/data/order-change-service.ts,
 * src/lib/ai/chat/agent.ts (tool result persistence),
 * src/lib/api/with-error-handler.ts (Sentry capture pre-processing).
 */

/** Keys whose values should always be redacted. */
const SENSITIVE_KEYS = new Set(
  [
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
  ].map((key) => key.toLowerCase()),
);

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
 * Regex: matches email addresses.
 * Standard RFC-5322-ish simplified pattern — covers virtually all real-world
 * emails. Redacts the entire address so no username or domain leaks.
 * Examples: ahmed@example.com, user.name+tag@sub.domain.co.uk
 */
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

/** Standard Error fields that redactError copies explicitly (skip in own-prop loop). */
const ERROR_OWN_FIELDS = new Set(["message", "name", "stack"]);

/**
 * Deep-clone + redact sensitive fields in any JSON-serializable value.
 * Returns a new object; does not mutate the input.
 */
export function redactPii<T>(value: T): T {
  return redactRecursive(value) as T;
}

function redactRecursive(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return new Date(value.getTime());
  if (typeof value === "string") {
    // Redact phone numbers + emails embedded in strings
    return value
      .replace(PHONE_REGEX, "[PHONE]")
      .replace(INT_PHONE_REGEX, "[PHONE]")
      .replace(EMAIL_REGEX, "[EMAIL]");
  }
  if (Array.isArray(value)) {
    return value.map(redactRecursive);
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      // Normalize both the configured key set and the lookup key so camelCase,
      // uppercase, snake-like and mixed-case spellings share one comparison.
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
  if (v instanceof Date) return "[REDACTED]";
  if (Array.isArray(v)) return v.map(redactScalar);
  if (typeof v === "object") return redactRecursive(v);
  return "[REDACTED]";
}

/**
 * Redact PII from an Error (or any thrown value) BEFORE sending to Sentry.
 * (W3-24: prevents Prisma errors / validation messages containing customer
 * phone, email, or address from leaking into Sentry breadcrumbs.)
 *
 * Returns a NEW Error (so the original is untouched). Preserves:
 *   - err.name (Error class name)
 *   - err.stack (PII-scrubbed)
 *   - all own-properties (e.g. Prisma's `.code`, `.meta` — PII-scrubbed via
 *     redactPii, which redacts sensitive keys + phone/email patterns).
 *
 * For non-Error inputs:
 *   - strings → PII-scrubbed string
 *   - plain objects → redactPii(obj)
 *   - everything else → returned unchanged (numbers, booleans, null, undefined)
 */
export function redactError(err: unknown): unknown {
  if (err instanceof Error) {
    const redacted = new Error(redactPii(err.message));
    redacted.name = err.name;
    if (err.stack) redacted.stack = redactPii(err.stack);
    // Preserve any custom own properties (e.g. Prisma's .code, .meta,
    // ZodError's .issues). redactPii deep-clones + redacts sensitive values.
    for (const key of Object.keys(err)) {
      if (ERROR_OWN_FIELDS.has(key)) continue;
      (redacted as unknown as Record<string, unknown>)[key] = redactPii(
        (err as unknown as Record<string, unknown>)[key],
      );
    }
    return redacted;
  }
  if (typeof err === "string") return redactPii(err);
  if (err !== null && typeof err === "object") return redactPii(err);
  return err;
}
