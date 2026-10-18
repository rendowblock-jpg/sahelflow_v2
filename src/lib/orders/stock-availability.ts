import { ConflictError } from "@/types/errors";

/**
 * Stock availability for a manual-order confirmation (audit S03a-02 / S03c-01).
 *
 * INVARIANT: availability for a manual confirm is the on-hand stock minus ONLY
 * the active holds that have NOT already lowered the on-hand stock.
 *
 * Why. Product.stock and ProductVariant.stock are the "available" position of
 * the stock ledger. A manual confirmation DECREMENTS that stock by the ordered
 * quantity and, in the same transaction, opens an active InventoryReservation
 * for the same quantity (reserveOrderItem in manual-confirmation.ts). Cancel
 * adds the quantity back and releases the hold (canonical-order-recovery.ts);
 * ship consumes the hold and leaves stock alone (canonical-fulfillment.ts).
 * A manual hold is therefore already out of the stock number and must not be
 * subtracted a second time: that made every confirmed-but-unshipped unit count
 * twice, so 10 on the shelf with 5 confirmed (stock 5, held 5) looked like 0
 * available.
 *
 * Storefront holds (storefront-delegation.ts, storefront-rollback.ts) are the
 * opposite: they are carved out of physical stock WITHOUT lowering it
 * (quantity = stock - alreadyProtected), and the database refuses to push stock
 * below them (migration 20260814030000_storefront_delegation_guards). They
 * still have to be subtracted.
 *
 * Discriminator. A hold is treated as "already lowered stock" only when BOTH
 * hold: (1) the command that opened it also wrote an InventoryMovement of type
 * 'reserve' for it, which only manual-confirmation.ts emits, in the same fact
 * set as the stock decrement; and (2) its reservationKey does not carry a
 * storefront prefix (the same two prefixes the storefront code and the
 * database guard use to recognise storefront holds). Anything else, including
 * a legacy row or a producer added later, is counted in full: the check can
 * only become stricter than "subtract nothing", never looser.
 *
 * This module is deliberately pure (no database, no server-only) so the
 * arithmetic can be unit-tested without a database.
 */

/** Key prefixes used by every storefront hold (delegation and provisional). */
export const STOREFRONT_HOLD_KEY_PREFIXES = [
  "storefront-delegation:",
  "storefront-provisional:",
] as const;

export interface ActiveStockHold {
  reservationKey: string;
  quantity: number;
  /**
   * True when an InventoryMovement of type 'reserve' for this hold was written
   * by the same command that opened the hold.
   */
  reserveMovementRecorded: boolean;
}

function assertSupportedQuantity(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ConflictError(`${label} is outside the supported integer range`);
  }
}

/** True when opening this hold already lowered Product.stock / ProductVariant.stock. */
export function holdAlreadyLoweredStock(hold: ActiveStockHold): boolean {
  if (!hold.reserveMovementRecorded) return false;
  return !STOREFRONT_HOLD_KEY_PREFIXES.some((prefix) =>
    hold.reservationKey.startsWith(prefix),
  );
}

/** Quantity held against on-hand stock without having been taken out of it. */
export function stockHeldAgainstOnHand(
  activeHolds: readonly ActiveStockHold[],
): number {
  let held = 0;
  for (const hold of activeHolds) {
    assertSupportedQuantity(hold.quantity, "Active inventory hold quantity");
    if (!holdAlreadyLoweredStock(hold)) held += hold.quantity;
  }
  assertSupportedQuantity(held, "Active inventory holds");
  return held;
}

/** Units a manual confirmation may still take. Never negative. */
export function availableForManualConfirm(input: {
  onHand: number;
  activeHolds: readonly ActiveStockHold[];
}): number {
  if (!Number.isSafeInteger(input.onHand)) {
    throw new ConflictError(
      "On-hand stock is outside the supported integer range",
    );
  }
  return Math.max(0, input.onHand - stockHeldAgainstOnHand(input.activeHolds));
}
