/**
 * Phase 6.16: Centralized Algerian phone validation and normalization.
 *
 * Two patterns existed across the codebase:
 *   - tool-handlers.ts: /^(05|06|07)[0-9]{8}$/ (local format)
 *   - evolution-api.ts: /^213[5-7]\d{8}$/ (international format)
 *
 * This module unifies both into a single source of truth.
 */

/** Local format: 05XXXXXXXX, 06XXXXXXXX, 07XXXXXXXX */
export const ALGERIAN_PHONE_LOCAL = /^0[5-7]\d{8}$/;

/** International format: 2135XXXXXXXX, 2136XXXXXXXX, 2137XXXXXXXX */
export const ALGERIAN_PHONE_INTERNATIONAL = /^213[5-7]\d{8}$/;

/**
 * Strip all non-digit characters from a phone string.
 */
export function cleanPhone(phone: string): string {
	return phone.replace(/[^0-9]/g, "");
}

/**
 * Convert any Algerian phone number to local format (0XXXXXXXXX).
 * Returns null if the number doesn't match any known Algerian format.
 */
export function toLocalFormat(phone: string): string | null {
	const clean = cleanPhone(phone);
	// Already in local format: 0[5-7]XXXXXXXX
	if (ALGERIAN_PHONE_LOCAL.test(clean)) return clean;
	// International format: 213[5-7]XXXXXXXX → 0[5-7]XXXXXXXX
	if (clean.startsWith("213") && ALGERIAN_PHONE_INTERNATIONAL.test(clean)) {
		return "0" + clean.slice(3);
	}
	// Bare format without leading 0 or 213: [5-7]XXXXXXXX (9 digits)
	if (/^[5-7]\d{8}$/.test(clean)) return "0" + clean;
	return null;
}

/**
 * Convert any Algerian phone number to international format (213XXXXXXXXX).
 * Returns null if the number doesn't match any known Algerian format.
 */
export function toInternationalFormat(phone: string): string | null {
	const clean = cleanPhone(phone);
	// Already in international format
	if (ALGERIAN_PHONE_INTERNATIONAL.test(clean)) return clean;
	// Local format: 0[5-7]XXXXXXXX → 213[5-7]XXXXXXXX
	if (ALGERIAN_PHONE_LOCAL.test(clean)) return "213" + clean.slice(1);
	// Bare format: [5-7]XXXXXXXX → 213[5-7]XXXXXXXX
	if (/^[5-7]\d{8}$/.test(clean)) return "213" + clean;
	return null;
}

/**
 * Validate whether a string is a valid Algerian phone number (any format).
 */
export function isValidAlgerianPhone(phone: string): boolean {
	return toLocalFormat(phone) !== null;
}
