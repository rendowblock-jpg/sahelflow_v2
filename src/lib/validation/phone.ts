/**
 * Canonical Algerian mobile-phone helpers (audit d6 #1/#7/#10).
 *
 * ONE validator, ONE formatter, ONE placeholder for every DZ phone field:
 *   - display mask:     "05 55 12 34 56"  -> `DZ_PHONE_PLACEHOLDER` / `formatDZPhone`
 *   - persisted value:  "0555123456"      -> `normalizeDZPhone` (what forms submit)
 *   - validation:       0[5-7] + 8 digits -> `isValidDZMobilePhone` / `dzPhoneSchema`
 *
 * RTL/bidi NOTE (audit d6 #1): phone digits are technical LTR content. Every
 * input using this module must render with
 * `type="tel" inputMode="tel" dir="ltr" autoComplete="tel-national"` so the
 * digit groups never reorder in the Arabic UI, while the surrounding
 * label/layout stays flow-relative (logical Tailwind utilities only).
 *
 * OWNERSHIP NOTE: `src/lib/validation/index.ts` (`dzPhone`) is owned by open
 * PR #355 — this module deliberately does not import or re-export it. The
 * accepted shape is kept identical (`/^0[5-7]\d{8}$/` on the normalized
 * value) so client and server boundaries agree. `src/lib/import/fields.ts`
 * owns a server-side `normalizePhone`; this client-safe copy exists because
 * that module is import-owned by another workstream.
 *
 * This module is imported by client components: keep it free of "server-only"
 * and node built-ins.
 */
import { z } from "zod";

/** The canonical Algerian mobile mask, used as THE placeholder everywhere. */
export const DZ_PHONE_PLACEHOLDER = "05 55 12 34 56";

/** Strict Algerian mobile shape: 10 digits starting 05/06/07. */
const DZ_MOBILE_REGEX = /^0[5-7]\d{8}$/;

/**
 * Normalize any user-entered phone to the local digits-only form
 * ("0555123456"). Strips separators and canonicalizes +213 / 00213 / 213
 * prefixes. Returns "" for empty input.
 */
export function normalizeDZPhone(raw: string): string {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (!digits) return "";
  let national: string;
  if (digits.startsWith("00213")) national = digits.slice(5);
  else if (digits.startsWith("213")) national = digits.slice(3);
  else if (digits.startsWith("0")) national = digits.slice(1);
  else national = digits;
  return `0${national}`;
}

/**
 * Format for display/typing: "0X XX XX XX XX" (e.g. "0555123456" ->
 * "05 55 12 34 56"). Caps at the 9 national digits so the live mask never
 * grows past the valid length while the user types.
 */
export function formatDZPhone(raw: string): string {
  const national = normalizeDZPhone(raw).slice(1, 10);
  if (!national) return "";
  let formatted = `0${national[0]}`;
  for (let i = 1; i < national.length; i++) {
    if (i % 2 === 1) formatted += " ";
    formatted += national[i];
  }
  return formatted;
}

/**
 * THE validator (audit d6 #7): strict `0[5-7] + 8 more digits`, tolerant of
 * separators/masking so the displayed value ("05 55 12 34 56") validates
 * identically to the persisted one ("0555123456").
 */
export function isValidDZMobilePhone(raw: string): boolean {
  return DZ_MOBILE_REGEX.test(normalizeDZPhone(raw));
}

/**
 * Form-facing zod schema built on the same canonical rule — accepts the
 * masked display value, no transform (form state keeps what the user sees;
 * call `normalizeDZPhone` before persisting/submitting to a strict API).
 */
export const dzPhoneSchema = z
  .string()
  .trim()
  .min(1, "Phone is required")
  .refine((value) => isValidDZMobilePhone(value), {
    message: "Invalid Algerian phone (must be 0[5-7]XXXXXXXX)",
  });
