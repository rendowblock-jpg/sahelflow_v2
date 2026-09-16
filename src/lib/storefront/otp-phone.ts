import "server-only";

/**
 * Algerian phone normalization to E.164 (FD-061 EX-4, slice 6).
 *
 * Contract transcribed verbatim from the live-proven CodFlow engine
 * (cod-server/src/endpoints/store-otp/phone.ts @ 00f18fa, Apache-2.0):
 * the storefront order schema accepts free-form phones while dzverify
 * requires strict E.164 ("+213612345678"). This module is the single
 * place that reconciles the two.
 *
 * Interface: one function. Returns the E.164 string, or null when the
 * input cannot be normalized (caller surfaces INVALID_PHONE_FORMAT).
 *
 * Accepted inputs (case: Algerian mobile):
 *   "0551234567"  "5 51-234 567"  "0551234567 "  → "+213551234567"
 *   "+213551234567" "213551234567"               → "+213551234567"
 *   Other countries pass through when already "+CC…" shaped.
 */

const ALGERIAN_COUNTRY_CODE = "213";
const ALGERIAN_MOBILE_PREFIX = /^[567]/;

/** Strip visual separators — dzverify rejects spaces and dashes. */
function clean(raw: string): string {
  return raw.replace(/[\s\-().]/g, "");
}

export function normalizeAlgerianPhone(raw: string): string | null {
  if (typeof raw !== "string") return null;
  let phone = clean(raw.trim());
  if (phone.length < 6 || phone.length > 20) return null;

  // International dialing prefix "00" (e.g. "00213551234567") — treat as "+".
  if (phone.startsWith("00")) {
    phone = `+${phone.slice(2)}`;
  }

  // Already international: keep the + form. E.164 allows 7–15 digits after +.
  if (phone.startsWith("+")) {
    return /^\+\d{7,15}$/.test(phone) ? phone : null;
  }

  // "213…" without the + — complete it.
  if (phone.startsWith(ALGERIAN_COUNTRY_CODE)) {
    const rest = phone.slice(ALGERIAN_COUNTRY_CODE.length);
    return ALGERIAN_MOBILE_PREFIX.test(rest) ? `+${phone}` : null;
  }

  // Local form: 0-prefixed or bare Algerian mobile.
  const local = phone.startsWith("0") ? phone.slice(1) : phone;
  if (local.length === 9 && ALGERIAN_MOBILE_PREFIX.test(local)) {
    return `+${ALGERIAN_COUNTRY_CODE}${local}`;
  }

  return null;
}
