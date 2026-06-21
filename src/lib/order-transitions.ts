/**
 * Order status transition rules — the state machine.
 *
 * This is the TypeScript source of truth for which status transitions
 * are allowed. It mirrors the business logic (not a DB constraint):
 *
 *   draft → pending → confirmed → shipped → delivered
 *                                     │         │
 *                                     │         └→ returned
 *                                     └→ refused / cancelled
 *
 * Terminal states (delivered, returned, refused, cancelled) cannot
 * transition OUT to a different status. Same-status transitions are
 * no-ops (allowed, but don't trigger side effects).
 *
 * Stock side effects (handled in the order service, NOT here):
 *   → confirmed (from non-confirmed): deduct stock per item
 *   → returned | cancelled | refused (from confirmed | shipped): restore stock
 *   → delivered (from non-delivered): increment customer.orderCount + totalSpent
 */

import type { OrderStatus } from "@/types/domain";
import { InvalidTransitionError } from "@/types/errors";

/** All 8 order statuses. */
export const ORDER_STATUSES = [
  "draft",
  "pending",
  "confirmed",
  "shipped",
  "delivered",
  "returned",
  "refused",
  "cancelled",
] as const;

/** Terminal statuses — once reached, the order cannot move to a different status. */
export const TERMINAL_ORDER_STATUSES = [
  "delivered",
  "returned",
  "refused",
  "cancelled",
] as const;

/** Active (non-terminal) statuses. */
export const ACTIVE_ORDER_STATUSES: OrderStatus[] = ORDER_STATUSES.filter(
  (s): s is OrderStatus => !TERMINAL_ORDER_STATUSES.includes(s as (typeof TERMINAL_ORDER_STATUSES)[number]),
);

/** Returns true if the status is terminal. */
export function isTerminalStatus(status: OrderStatus): boolean {
  return (TERMINAL_ORDER_STATUSES as readonly string[]).includes(status);
}

/**
 * The transition table: for each status, which statuses can it move to?
 * Same-status is always allowed (no-op). Terminal states can only stay.
 */
export const ALLOWED_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  draft: ["pending", "cancelled"],
  pending: ["confirmed", "cancelled"],
  confirmed: ["shipped", "returned", "refused", "cancelled"],
  shipped: ["delivered", "returned", "refused"],
  delivered: [], // terminal
  returned: [], // terminal
  refused: [], // terminal
  cancelled: [], // terminal
};

/**
 * Check if a transition is allowed.
 *
 * Rules:
 * 1. Same-status → always allowed (no-op).
 * 2. Terminal status → cannot move to a different status.
 * 3. Otherwise → must be in the ALLOWED_TRANSITIONS list.
 */
export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  // Same-status is always a no-op
  if (from === to) return true;

  // Terminal states cannot move
  if (isTerminalStatus(from)) return false;

  // Must be in allowed list
  const allowed = ALLOWED_TRANSITIONS[from];
  return (allowed as readonly string[]).includes(to);
}

/**
 * Get the list of statuses this status can transition to (excluding itself).
 * Returns empty array for terminal states.
 */
export function getAllowedTransitions(from: OrderStatus): OrderStatus[] {
  if (isTerminalStatus(from)) return [];
  return [...ALLOWED_TRANSITIONS[from]];
}

/**
 * Assert that a transition is allowed. Throws InvalidTransitionError if not.
 */
export function assertCanTransition(
  from: OrderStatus,
  to: OrderStatus,
): void {
  if (!canTransition(from, to)) {
    throw new InvalidTransitionError(from, to, getAllowedTransitions(from));
  }
}

/**
 * Does transitioning to this status trigger a stock deduction?
 * (confirmed, from a non-confirmed status)
 */
export function triggersStockDeduction(from: OrderStatus, to: OrderStatus): boolean {
  return to === "confirmed" && from !== "confirmed";
}

/**
 * Does transitioning to this status trigger a stock restoration?
 * (returned, cancelled, or refused — from confirmed or shipped)
 */
export function triggersStockRestoration(from: OrderStatus, to: OrderStatus): boolean {
  if (!["returned", "cancelled", "refused"].includes(to)) return false;
  return ["confirmed", "shipped"].includes(from);
}

/**
 * Does transitioning to this status trigger customer stats update?
 * (delivered, from a non-delivered status)
 */
export function triggersCustomerStatsUpdate(from: OrderStatus, to: OrderStatus): boolean {
  return to === "delivered" && from !== "delivered";
}
