/**
 * The seller's way out of a stuck courier booking (audit S03c-08).
 *
 * When a courier call times out, fails, or answers without a tracking number,
 * the delivery is parked in `reconciliation_required`: SahelFlow does not know
 * whether the courier holds the parcel. The seller can look at the courier's
 * own app and then decide:
 *   - "courier-has-it": record the booking with the tracking number the seller
 *     read there. No courier call.
 *   - "book-again": drop the empty reservation so a fresh attempt can be made.
 *     This can create a second parcel and a second fee if the first call did
 *     reach the courier, so the caller must have asked for explicit consent.
 *
 * Pure module: no database, safe to import from a client component.
 */
import { DELIVERY_STATUSES } from "@/lib/delivery/delivery-status-transitions";
import { SahelFlowError } from "@/types/errors";

export const RECONCILIATION_STATUS = "reconciliation_required" as const;
export const CREATING_STATUS = "creating" as const;

/** The ten real statuses plus the two legacy booking-limbo values. */
export const DELIVERY_STATUS_SET: readonly string[] = [
  ...DELIVERY_STATUSES,
  CREATING_STATUS,
  RECONCILIATION_STATUS,
];

export const RECONCILE_ACTIONS = ["courier-has-it", "book-again"] as const;
export type ReconcileAction = (typeof RECONCILE_ACTIONS)[number];

/** `released` = the empty reservation is gone and the order can be booked again. */
export type ReconcileNext = "created" | "released";

export type ReconcileRequest =
  | { action: "courier-has-it"; tracking: string }
  | { action: "book-again" };

export type ReconcilePlan =
  | { kind: "apply"; next: ReconcileNext }
  | { kind: "noop" };

export class DeliveryReconcileRefusedError extends SahelFlowError {
  constructor(
    public readonly from: string,
    public readonly action: string,
  ) {
    super(
      `A delivery in status '${from}' cannot be resolved with '${action}'`,
      "DELIVERY_NOT_AWAITING_DECISION",
      409,
    );
  }
}

export class DeliveryTrackingMismatchError extends SahelFlowError {
  constructor(public readonly from: string) {
    super(
      "This delivery already has a different tracking number",
      "DELIVERY_TRACKING_MISMATCH",
      409,
    );
  }
}

function isReconcileAction(value: string): value is ReconcileAction {
  return (RECONCILE_ACTIONS as readonly string[]).includes(value);
}

/**
 * Where a stuck delivery goes for each seller decision. Only
 * `reconciliation_required` may use these; every other status is refused.
 */
export function nextDeliveryStatus(
  current: string,
  action: ReconcileAction,
): ReconcileNext {
  if (current !== RECONCILIATION_STATUS || !isReconcileAction(action)) {
    throw new DeliveryReconcileRefusedError(current, String(action));
  }
  return action === "courier-has-it" ? "created" : "released";
}

/** Trimmed tracking number, or null when it is empty, spaced, or unprintable. */
export function normalizeCourierTracking(raw: string): string | null {
  const value = raw.trim();
  if (value.length === 0 || value.length > 120) return null;
  return /^[^\s\p{C}]+$/u.test(value) ? value : null;
}

/**
 * Decide what a request does to the delivery as it is now.
 * A repeat of "courier-has-it" with the tracking number already saved is a
 * no-op, not an error; a different number is refused. A delivery that already
 * has a tracking number can never be released (that would orphan a parcel).
 */
export function planReconcile(
  current: { status: string; trackingNumber: string | null },
  request: ReconcileRequest,
): ReconcilePlan {
  const saved = current.trackingNumber ? current.trackingNumber : null;
  if (request.action === "courier-has-it") {
    if (saved !== null && saved !== request.tracking) {
      throw new DeliveryTrackingMismatchError(current.status);
    }
    if (current.status !== RECONCILIATION_STATUS && saved !== null) {
      return { kind: "noop" };
    }
    return {
      kind: "apply",
      next: nextDeliveryStatus(current.status, request.action),
    };
  }
  if (saved !== null) {
    throw new DeliveryReconcileRefusedError(current.status, request.action);
  }
  return {
    kind: "apply",
    next: nextDeliveryStatus(current.status, request.action),
  };
}
