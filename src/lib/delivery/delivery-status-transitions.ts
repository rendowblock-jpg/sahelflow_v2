/**
 * Delivery status transition rules for the MANUAL (legacy) delivery update,
 * PATCH /api/delivery/[id].
 *
 * Audit S03c-06: the route used to accept any of ten free strings for any
 * delivery. A manual update propagates delivered / returned / refused to the
 * order (customer stats, stock, COD position), so an impossible jump left the
 * delivery and the order telling different stories.
 *
 * Shape of the table
 *   - In-flight statuses (pending … out_for_delivery, failed) can move to any
 *     other status. The manual update exists for offline couriers (steps are
 *     skipped) and for correcting a wrong provider status (moves go back),
 *     and nothing about an in-flight status has touched the order yet.
 *   - Outcome statuses are final, because entering them already moved the
 *     order and the order state machine has no way back:
 *       delivered → returned only (the post-delivery return the order
 *                    machine allows, see order-transitions.ts)
 *       refused   → returned only (the parcel came back to the seller)
 *       returned  → nothing
 *   - A same-status update is always allowed. It is a harmless re-apply and
 *     it is how a delivery that the provider sync already marked delivered
 *     retries the order propagation when that conflicted.
 *   - Any current status outside these ten (the legacy booking limbo values
 *     `creating` and `reconciliation_required`, or an odd historical value)
 *     can be corrected to any real status. Refusing would strand a row that
 *     today can still be fixed by hand.
 *
 * The provider sync (POST /api/delivery/sync) is NOT governed by this table:
 * the courier is the authority on its own parcel, so the sync records
 * whatever the provider reports.
 *
 * Pure module: no database, no server-only import, safe to share with a
 * client component that wants to list only the reachable statuses.
 */
import type { DeliveryStatus } from "@/types/domain";
import { InvalidTransitionError } from "@/types/errors";

/** The ten delivery statuses shared by the API, the badge and the adapters. */
export const DELIVERY_STATUSES = [
  "pending",
  "created",
  "picked_up",
  "in_transit",
  "at_hub",
  "out_for_delivery",
  "delivered",
  "returned",
  "refused",
  "failed",
] as const satisfies readonly DeliveryStatus[];

export type DeliveryStatusValue = (typeof DELIVERY_STATUSES)[number];

function everyOtherStatus(from: DeliveryStatusValue): DeliveryStatusValue[] {
  return DELIVERY_STATUSES.filter((status) => status !== from);
}

/** For each status, the other statuses a manual update may move it to. */
export const DELIVERY_STATUS_TRANSITIONS: Readonly<
  Record<DeliveryStatusValue, readonly DeliveryStatusValue[]>
> = {
  pending: everyOtherStatus("pending"),
  created: everyOtherStatus("created"),
  picked_up: everyOtherStatus("picked_up"),
  in_transit: everyOtherStatus("in_transit"),
  at_hub: everyOtherStatus("at_hub"),
  out_for_delivery: everyOtherStatus("out_for_delivery"),
  failed: everyOtherStatus("failed"),
  delivered: ["returned"],
  refused: ["returned"],
  returned: [],
};

function isKnownStatus(value: string): value is DeliveryStatusValue {
  return (DELIVERY_STATUSES as readonly string[]).includes(value);
}

/** Statuses a manual update may move `from` to (excluding `from` itself). */
export function allowedDeliveryTransitions(
  from: string,
): readonly DeliveryStatusValue[] {
  return isKnownStatus(from)
    ? DELIVERY_STATUS_TRANSITIONS[from]
    : DELIVERY_STATUSES;
}

export function canTransitionDelivery(
  from: string,
  to: DeliveryStatusValue,
): boolean {
  if (from === to) return true;
  return allowedDeliveryTransitions(from).includes(to);
}

/**
 * Throws the repo's 409 InvalidTransitionError (the same class the order state
 * machine and the sync route use) for an impossible jump.
 */
export function assertDeliveryStatusTransition(
  from: string,
  to: DeliveryStatusValue,
): void {
  if (!canTransitionDelivery(from, to)) {
    throw new InvalidTransitionError(from, to, allowedDeliveryTransitions(from));
  }
}
