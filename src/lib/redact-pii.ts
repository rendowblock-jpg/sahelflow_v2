/**
 * PII redaction for JSON snapshots (Session 30, AUDIT-4 D6).
 *
 * AuditLog.before/after/metadata, OrderChange.payload, and
 * AiChatMessage.toolCalls all store JSON that can contain plaintext
 * customer PII (phone, address, notes). This module provides:
 *
 *   - redactPii(obj) → deep-clones obj, replacing sensitive or unapproved
 *     string fields with "[REDACTED]" so provider aliases cannot bypass the
 *     audit boundary.
 *   - redactError(err) → returns a NEW Error with message/stack PII-scrubbed.
 *
 * Object string persistence is allowlisted rather than blocklisted. Numbers,
 * booleans and dates remain available for forensic comparisons. Machine-owned
 * identifiers and state/type/code fields survive through a semantic key rule;
 * free-form values and unknown provider aliases are redacted by default.
 */

const KEY_SEPARATOR_REGEX = /[^a-z0-9]/g;

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(KEY_SEPARATOR_REGEX, "");
}

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
    "nom",
    "prenom",
    "adresse",
    "telephone",
    "tel",
    "mobile",
    "client",
    "contact",
    "recipient",
    "destinataire",
  ].map(normalizeKey),
);

const SAFE_STRING_KEYS = new Set(
  [
    "key",
    "from",
    "to",
    "action",
    "entity",
    "method",
    "currency",
    "operation",
    "mode",
    "scope",
    "role",
    "permission",
    "trigger",
    "direction",
    "channel",
    "locale",
    "language",
    "format",
    "algorithm",
    "safeField",
  ].map(normalizeKey),
);

const SAFE_MACHINE_KEY_SUFFIXES = [
  "id",
  "status",
  "state",
  "type",
  "kind",
  "code",
  "source",
  "provider",
  "method",
  "currency",
  "operation",
  "mode",
  "scope",
  "role",
  "permission",
  "trigger",
  "version",
  "position",
  "actor",
  "format",
  "algorithm",
  "locale",
  "language",
  "field",
  "path",
  "table",
] as const;

function isSafeStringKey(normalizedKey: string): boolean {
  return (
    SAFE_STRING_KEYS.has(normalizedKey) ||
    SAFE_MACHINE_KEY_SUFFIXES.some((suffix) => normalizedKey.endsWith(suffix))
  );
}

const PHONE_REGEX = /\b0\d(?:\s?\d{2}){4}\b/g;
const INT_PHONE_REGEX = /\+213\s?\d(?:\s?\d{2}){4}/g;
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const ERROR_OWN_FIELDS = new Set(["message", "name", "stack"]);

export function redactPii<T>(value: T): T {
  return redactRecursive(value) as T;
}

function scrubEmbeddedPii(value: string): string {
  return value
    .replace(PHONE_REGEX, "[PHONE]")
    .replace(INT_PHONE_REGEX, "[PHONE]")
    .replace(EMAIL_REGEX, "[EMAIL]");
}

function redactRecursive(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return new Date(value.getTime());
  if (typeof value === "string") return scrubEmbeddedPii(value);
  if (Array.isArray(value)) return value.map(redactRecursive);
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(obj)) {
      const normalizedKey = normalizeKey(key);
      const redactedValue = SENSITIVE_KEYS.has(normalizedKey)
        ? redactScalar(entry)
        : typeof entry === "string"
          ? isSafeStringKey(normalizedKey)
            ? scrubEmbeddedPii(entry)
            : redactScalar(entry)
          : Array.isArray(entry) && !isSafeStringKey(normalizedKey)
            ? redactScalar(entry)
            : redactRecursive(entry);

      Object.defineProperty(out, key, {
        value: redactedValue,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    return out;
  }
  return value;
}

function redactScalar(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return value.length > 0 ? "[REDACTED]" : value;
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value;
  if (value instanceof Date) return "[REDACTED]";
  if (Array.isArray(value)) return value.map(redactScalar);
  if (typeof value === "object") return redactRecursive(value);
  return "[REDACTED]";
}

export function redactError(err: unknown): unknown {
  if (err instanceof Error) {
    const redacted = new Error(redactPii(err.message));
    redacted.name = err.name;
    if (err.stack) redacted.stack = redactPii(err.stack);
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
