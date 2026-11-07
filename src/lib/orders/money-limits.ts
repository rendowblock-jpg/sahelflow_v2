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

/**
 * Refuse an order-level discount that is not a whole number of dinars, or that
 * is larger than the items it comes off (a discount can never make the items
 * cost less than nothing). The delivery cost is not discounted.
 */
export function assertDiscountWithinItems(
  discountDzd: number,
  itemsTotal: number,
  field: string,
): void {
  if (!Number.isSafeInteger(discountDzd) || discountDzd < 0) {
    throw new ValidationError("The discount must be a whole number of dinars, zero or more", field);
  }
  if (discountDzd > itemsTotal) {
    throw new ValidationError("The discount is larger than the items", field);
  }
}
