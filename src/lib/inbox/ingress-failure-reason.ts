import type { Locale } from "@/lib/i18n";
import { getInboxHealthRuntimeTranslation } from "@/lib/i18n/inbox-health-runtime";

/**
 * Why do WhatsApp messages wait? The WhatsApp service reports the failure code of the
 * OLDEST message that has failed (payload.ingress.spool.lastFailureCode): a short token
 * such as APP_INGRESS_TIMEOUT or HTTP_503, never content. This turns it into ONE plain
 * sentence for a shop owner (ar / fr / en): what happened, what the seller can do, and
 * never that a message is lost or delivered.
 */

/**
 * What a code may look like before the inbox will show it. The service already drops
 * anything else (sidecars/whatsapp/ingress-health.ts); this repeats the rule where the
 * payload is read, with room for the 128 characters the spool keeps, so a stray string
 * (a name, a number) can never reach the screen or the copied text.
 */
export const FAILURE_CODE_PATTERN = /^[A-Za-z0-9_.:-]{1,128}$/;

/** Codes with their own sentence. HTTP_<n> other than 401 shares one; every other string gets the generic one. */
export const KNOWN_FAILURE_CODES = [
  "APP_INGRESS_TIMEOUT",
  "APP_INGRESS_UNAVAILABLE",
  "HTTP_401",
  "REQUEST_VALIDATION_FAILED",
  "INGRESS_PROCESSING_PENDING",
  "WHATSAPP_ACCOUNT_UNAVAILABLE",
  "WHATSAPP_ACCOUNT_MISMATCH",
  "CONFLICT",
  "LEASE_EXPIRED",
] as const;

const KNOWN = new Set<string>(KNOWN_FAILURE_CODES);

/** Pure: anything in, a safe short code or null out. */
export function parseFailureCode(value: unknown): string | null {
  return typeof value === "string" && FAILURE_CODE_PATTERN.test(value) ? value : null;
}

/** Pure: the copy key of the sentence for a code. */
export function failureReasonKey(code: string): string {
  if (KNOWN.has(code)) return `inboxHealth.why.${code}`;
  if (/^HTTP_\d{3}$/.test(code)) return "inboxHealth.why.http";
  return "inboxHealth.why.generic";
}

export function failureReasonText(locale: Locale, code: string): string {
  return getInboxHealthRuntimeTranslation(locale, failureReasonKey(code)) ?? "";
}
