/**
 * Order status transition rules — TypeScript source of truth.
 *
 * Mirrors the enforcement in the `atomic_update_order_status` PostgreSQL RPC
 * (supabase/migrations/000_baseline.sql). Keeping these in TS lets us unit-test
 * the state machine without a live DB, and lets UI/API code validate transitions
 * before dispatching to the RPC.
 *
 * Rules (verbatim from the SQL function):
 *  1. Terminal states (delivered, returned, refused, cancelled) cannot transition
 *     OUT to a different status. Attempting so raises
 *     'Cannot transition from terminal state %'.
 *  2. Same-status transitions are no-ops (the RPC returns the current row
 *     without applying side-effects).
 *  3. Any non-terminal → non-terminal transition is allowed. The SQL does NOT
 *     enforce a sequence (e.g. draft→pending→confirmed); app-layer logic handles
 *     business workflow.
 *
 * Stock side-effects (informational; enforced in SQL, not here):
 *  - → confirmed (from non-confirmed): deducts stock per item.
 *  - → returned | cancelled | refused (from confirmed | shipped): restores stock.
 *  - → delivered (from non-delivered): increments customer.order_count + total_spent.
 */

import type { OrderStatus } from "@/types/database";

/** All 8 order statuses allowed by the `orders.status` CHECK constraint. */
export const ORDER_STATUSES: readonly OrderStatus[] = [
  "draft",
  "pending",
  "confirmed",
  "shipped",
  "delivered",
  "returned",
  "refused",
  "cancelled",
] as const;

/**
 * Terminal order statuses — once reached, the order cannot move to a different
 * status. Matches the `IN ('delivered','returned','refused','cancelled')` check
 * in `atomic_update_order_status`.
 */
export const TERMINAL_ORDER_STATUSES: readonly OrderStatus[] = [
  "delivered",
  "returned",
  "refused",
  "cancelled",
] as const;

/** Non-terminal statuses (order is still in flight). */
export const ACTIVE_ORDER_STATUSES: readonly OrderStatus[] =
  ORDER_STATUSES.filter(
    (s) => !TERMINAL_ORDER_STATUSES.includes(s),
  ) as OrderStatus[];

/** Returns true if the status is terminal. */
export function isTerminalStatus(status: OrderStatus): boolean {
  return (TERMINAL_ORDER_STATUSES as readonly string[]).includes(status);
}

/**
 * Returns true if transitioning `from` → `to` is permitted by the
 * `atomic_update_order_status` RPC.
 *
 * Permitted when:
 *  - `from === to` (same-status is a no-op, always allowed), OR
 *  - `from` is NOT a terminal status (any non-terminal → any status is allowed;
 *    note the SQL only blocks terminal→different, so non-terminal→terminal like
 *    pending→delivered is technically allowed at the RPC level even if the
 *    business layer discourages it).
 *
 * Blocked when:
 *  - `from` is terminal AND `to !== from` → raises
 *    'Cannot transition from terminal state %'.
 */
export function isValidTransition(
  from: OrderStatus,
  to: OrderStatus,
): boolean {
  // Same-status is always a no-op.
  if (from === to) return true;
  // Terminal states cannot transition out.
  if (isTerminalStatus(from)) return false;
  // Any non-terminal → any (incl. terminal) is allowed by the RPC.
  return true;
}

/**
 * Returns the error message the RPC raises for an invalid transition, or null
 * if the transition is valid. Useful for asserting error messages in tests.
 */
export function transitionErrorMessage(
  from: OrderStatus,
  to: OrderStatus,
): string | null {
  if (isValidTransition(from, to)) return null;
  if (isTerminalStatus(from) && from !== to) {
    return `Cannot transition from terminal state ${from}`;
  }
  return "Invalid transition";
}
