/**
 * Order status transition rules — the presentation-independent compatibility
 * state machine. Canonical pending→confirmed is intentionally absent: that
 * transition is owned exclusively by the trusted manual command.
 */

import type { OrderStatus } from "@/types/domain";
import { InvalidTransitionError } from "@/types/errors";

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

export const TERMINAL_ORDER_STATUSES = [
  "returned",
  "refused",
  "cancelled",
] as const;

export const ACTIVE_ORDER_STATUSES: OrderStatus[] = ORDER_STATUSES.filter(
  (status): status is OrderStatus =>
    !TERMINAL_ORDER_STATUSES.includes(
      status as (typeof TERMINAL_ORDER_STATUSES)[number],
    ),
);

export function isTerminalStatus(status: OrderStatus): boolean {
  return (TERMINAL_ORDER_STATUSES as readonly string[]).includes(status);
}

export const ALLOWED_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  draft: ["pending", "cancelled"],
  pending: ["cancelled"],
  confirmed: ["shipped", "returned", "refused", "cancelled"],
  shipped: ["delivered", "returned", "refused"],
  delivered: ["returned"],
  returned: [],
  refused: [],
  cancelled: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  if (from === to) return true;
  if (isTerminalStatus(from)) return false;
  return (ALLOWED_TRANSITIONS[from] as readonly string[]).includes(to);
}

export function getAllowedTransitions(from: OrderStatus): OrderStatus[] {
  if (isTerminalStatus(from)) return [];
  return [...ALLOWED_TRANSITIONS[from]];
}

export function assertCanTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidTransitionError(from, to, getAllowedTransitions(from));
  }
}

/** Compatibility-only predicates; confirmation is no longer compatibility-authorized. */
export function triggersStockDeduction(_from: OrderStatus, _to: OrderStatus): boolean {
  return false;
}

export function triggersStockRestoration(from: OrderStatus, to: OrderStatus): boolean {
  if (!["returned", "cancelled", "refused"].includes(to)) return false;
  return ["confirmed", "shipped", "delivered"].includes(from);
}

export function triggersCustomerStatsUpdate(from: OrderStatus, to: OrderStatus): boolean {
  return to === "delivered" && from !== "delivered";
}

export function triggersCustomerStatsReversal(from: OrderStatus, to: OrderStatus): boolean {
  return from === "delivered" && to === "returned";
}
