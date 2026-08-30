"use client";

import { useCallback } from "react";

import { formatDZPhone, isValidDZMobilePhone } from "@/lib/validation/phone";

/**
 * usePhoneMask — Algerian phone formatting (Phase 3).
 *
 * Formats phone input as the user types: "0X XX XX XX XX"
 * (e.g. "0555123456" → "05 55 12 34 56").
 *
 * The formatting/validation logic lives in the canonical module
 * `src/lib/validation/phone.ts` (audit d6 #7 — one validator, one formatter,
 * one placeholder). This hook only adapts it for react-hook-form call sites.
 */
export function usePhoneMask() {
  const format = useCallback((v: string) => formatDZPhone(v), []);
  const onChange = useCallback((value: string): string => formatDZPhone(value), []);
  return { format, onChange };
}

/**
 * Validate an Algerian mobile phone (strict `0[5-7]` + 8 more digits,
 * separator-tolerant). Delegates to the canonical validator — see
 * `src/lib/validation/phone.ts`.
 */
export function isValidAlgerianPhone(phone: string): boolean {
  return isValidDZMobilePhone(phone);
}
