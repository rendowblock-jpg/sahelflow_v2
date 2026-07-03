"use client";

import { useCallback } from "react";

/**
 * usePhoneMask — Algerian phone formatting (Phase 3).
 *
 * Formats phone input as the user types: "0X XX XX XX XX"
 * (e.g. "0555123456" → "05 55 12 34 56").
 *
 * Accepts leading +213 or 0 — strips to the 9-digit national number,
 * then reformats with spaces. Returns the formatted value + an onChange
 * handler that strips non-digits before formatting.
 */
const ALGERIAN_PHONE_LENGTH = 9; // after stripping leading 0 or +213

function formatPhone(raw: string): string {
  // Strip everything except digits
  let digits = raw.replace(/\D/g, "");
  // Handle +213 / 00213 prefix
  if (digits.startsWith("00213")) digits = digits.slice(5);
  else if (digits.startsWith("213")) digits = digits.slice(3);
  // Strip leading 0 if present (we'll re-add it)
  if (digits.startsWith("0")) digits = digits.slice(1);
  // Cap at 9 digits
  digits = digits.slice(0, ALGERIAN_PHONE_LENGTH);
  // Format: 0X XX XX XX XX
  if (digits.length === 0) return "";
  let formatted = "0" + digits[0];
  for (let i = 1; i < digits.length; i++) {
    if (i % 2 === 1) formatted += " ";
    formatted += digits[i];
  }
  return formatted;
}

export function usePhoneMask() {
  const format = useCallback((v: string) => formatPhone(v), []);
  const onChange = useCallback((value: string): string => format(value), [format]);
  return { format, onChange };
}

/** Validate an Algerian phone number (9 digits after the leading 0). */
export function isValidAlgerianPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, "");
  const stripped = digits.startsWith("0") ? digits.slice(1) : digits.startsWith("213") ? digits.slice(3) : digits;
  return stripped.length === ALGERIAN_PHONE_LENGTH;
}
