/**
 * WhatsApp deep-link builder (R3-b).
 *
 * WhatsApp is the de-facto COD confirmation channel in Algeria (d7-b: 98% open
 * rate; manual confirmation "eats the whole day"), yet the app shipped with
 * ZERO wa.me links. This helper turns the app's canonical DZ phone format into
 * a `https://wa.me/<digits>?text=<encoded>` link that opens WhatsApp (desktop
 * client or web) with an optional prefilled message.
 *
 * Phone handling delegates to the canonical R1-a module
 * (`src/lib/validation/phone.ts`) so every accepted input shape — "0555123456",
 * "05 55 12 34 56", "+213555123456", "00213555123456", "213555123456" —
 * resolves to the same wa.me target. Numbers that are not valid Algerian
 * mobiles produce `null` so callers can hide the action instead of shipping a
 * dead link.
 *
 * This module is imported by client components: keep it free of "server-only"
 * and node built-ins.
 */
import { isValidDZMobilePhone, normalizeDZPhone } from "@/lib/validation/phone";

/** Algeria country code for wa.me targets. */
const DZ_COUNTRY_CODE = "213";

/**
 * Convert any app phone format to the wa.me digit form ("213555123456").
 * Returns null when the number is not a valid Algerian mobile.
 */
export function toWhatsAppDigits(raw: string): string | null {
  const normalized = normalizeDZPhone(raw ?? "");
  if (!isValidDZMobilePhone(normalized)) return null;
  // "0555123456" -> strip the national trunk "0", prefix the country code.
  return `${DZ_COUNTRY_CODE}${normalized.slice(1)}`;
}

/**
 * Build a `https://wa.me/<number>` deep link with an optional prefilled,
 * URL-encoded message. Returns null for unusable phone numbers (caller hides
 * the WhatsApp action) or when the message fails to encode.
 */
export function buildWhatsAppLink(
  phone: string,
  message?: string,
): string | null {
  const digits = toWhatsAppDigits(phone);
  if (!digits) return null;
  const base = `https://wa.me/${digits}`;
  const text = message?.trim();
  if (!text) return base;
  try {
    return `${base}?text=${encodeURIComponent(text)}`;
  } catch {
    // encodeURIComponent only throws on lone surrogates — degrade to a bare link.
    return base;
  }
}
