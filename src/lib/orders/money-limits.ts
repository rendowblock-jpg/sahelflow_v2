import { z } from "zod";

import { ValidationError } from "@/types/errors";

/**
 * Largest amount in dinars that any order input may carry: a delivery cost, a
 * unit price, or an order total (about one billion, far above a real order).
 * Without a ceiling a value near Number.MAX_SAFE_INTEGER passed validation and
 * itemsTotal + deliveryCost left the safe integer range before it reached the
 * database.
 */
export const MAX_MONEY_DZD = 999_999_999;

/** A whole-dinar delivery cost or unit price taken from an order input. */
export const orderMoneySchema = z
  .number()
  .int()
  .nonnegative()
  .max(MAX_MONEY_DZD);

/** Refuse an order total above the ceiling (or not a safe integer at all). */
export function assertOrderTotalWithinLimit(
  totalPrice: number,
  field: string,
): void {
  if (!Number.isSafeInteger(totalPrice) || totalPrice > MAX_MONEY_DZD) {
    throw new ValidationError("The order total is too large", field);
  }
}
