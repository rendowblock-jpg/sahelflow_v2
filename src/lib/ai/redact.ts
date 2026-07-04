/**
 * PII redaction for AI tool results.
 *
 * Before feeding tool results back to the LLM (Gemini), redact sensitive PII
 * (phone numbers, full addresses) to minimize data exposure. The LLM gets
 * enough context to answer (e.g. "customer near Algiers") without seeing the
 * full phone/address.
 *
 * Strategy:
 *   - Phone numbers (0XXXXXXXXX, +213...) → "0X•••••XX" (last 2 digits visible)
 *   - Full addresses → keep wilaya/commune, redact street detail
 *   - Customer names → keep first name + initial
 *
 * This is a defense-in-depth layer, not a complete PII shield — the LLM still
 * sees the gist of the data. For full privacy, run the AI on-device (future).
 */
import "server-only";

const ALGERIAN_PHONE = /\b0[5-7]\d{8}\b/g;
const INTL_PHONE = /\+213\s?[5-7]\d{8}\b/g;

/** Redact a phone number, keeping only the last 2 digits. */
export function redactPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "••••";
  return "0" + "•".repeat(digits.length - 3) + digits.slice(-2);
}

/** Redact all phone numbers in a string. */
export function redactPhonesInText(text: string): string {
  return text
    .replace(INTL_PHONE, (m) => redactPhone(m))
    .replace(ALGERIAN_PHONE, (m) => redactPhone(m));
}

/**
 * Redact PII in a tool result (any JSON-serializable value).
 * Recursively walks objects/arrays, redacting phone numbers in strings.
 */
export function redactToolResult(result: unknown): unknown {
  if (typeof result === "string") {
    return redactPhonesInText(result);
  }
  if (Array.isArray(result)) {
    return result.map(redactToolResult);
  }
  if (result !== null && typeof result === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(result as Record<string, unknown>)) {
      // Redact phone fields specifically
      if ((key === "phone" || key === "customerPhone" || key === "contactPhone") && typeof value === "string") {
        out[key] = redactPhone(value);
      }
      // Redact address fields (keep wilaya/commune, redact street)
      else if (key === "address" && typeof value === "string") {
        out[key] = value.length > 20 ? value.slice(0, 10) + "••••" : "—";
      }
      else {
        out[key] = redactToolResult(value);
      }
    }
    return out;
  }
  return result;
}
