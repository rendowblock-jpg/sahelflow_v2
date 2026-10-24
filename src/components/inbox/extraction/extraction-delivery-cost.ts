import { MAX_MONEY_DZD } from "@/lib/orders/money-limits";

/** Delivery charge a reviewed WhatsApp order starts with; the seller can change it before creating the order. */
export const EXTRACTION_DELIVERY_COST = 600;

/**
 * The starting value of the delivery-cost field. The only per-wilaya prices
 * are the storefront shipping rules, which the inbox cannot read without a
 * request and which split into home and desk fees; the order form also starts
 * at 600. So the wilaya does not change it; it is a parameter for later.
 */
export function initialExtractionDeliveryCost(_wilaya?: string): number {
  return EXTRACTION_DELIVERY_COST;
}

// Arabic-Indic (٠-٩) and Persian (۰-۹) digits, as typed on an Arabic keyboard.
const EASTERN_DIGITS = /[\u0660-\u0669\u06f0-\u06f9]/g;

/**
 * Reads the delivery-cost field. The create route refuses a delivery cost
 * above MAX_MONEY_DZD, so the field takes a whole number from 0 up to the same
 * ceiling and says "invalid" before the seller presses Create; anything else
 * is null.
 */
export function parseDeliveryCost(text: string): number | null {
  const digits = text.trim().replace(EASTERN_DIGITS, (digit) => String(digit.charCodeAt(0) & 0xf));
  if (!/^\d+$/.test(digits)) return null;
  const value = Number(digits);
  return value <= MAX_MONEY_DZD ? value : null;
}
