/** Delivery charge a reviewed WhatsApp order starts with; the seller can change it before creating the order. */
export const EXTRACTION_DELIVERY_COST = 600;

/**
 * The starting value of the delivery-cost field. The app keeps no per-wilaya
 * delivery price the inbox can read (the order form also starts at 600), so
 * the wilaya does not change it yet; it is a parameter so a table can slot in.
 */
export function initialExtractionDeliveryCost(_wilaya?: string): number {
  return EXTRACTION_DELIVERY_COST;
}

// Arabic-Indic (٠-٩) and Persian (۰-۹) digits, as typed on an Arabic keyboard.
const EASTERN_DIGITS = /[\u0660-\u0669\u06f0-\u06f9]/g;

/**
 * Reads the delivery-cost field. The create route takes any integer from 0
 * up to the largest safe integer (`z.number().int().nonnegative()`), so that
 * is the range; anything else is null.
 */
export function parseDeliveryCost(text: string): number | null {
  const digits = text.trim().replace(EASTERN_DIGITS, (digit) => String(digit.charCodeAt(0) & 0xf));
  if (!/^\d+$/.test(digits)) return null;
  const value = Number(digits);
  return Number.isSafeInteger(value) ? value : null;
}
