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

/**
 * A courier call has a 30 s timeout, so a row still in `creating` after 15
 * minutes was left behind by a process that died mid-booking.
 */
export const STUCK_CREATING_AFTER_MINUTES = 15;
export const STUCK_CREATING_AFTER_MS = STUCK_CREATING_AFTER_MINUTES * 60_000;

/** What a date column looks like on the server (Date), in JSON (string) or as epoch ms. */
export type ClockValue = number | string | Date | null | undefined;

function readClock(value: ClockValue): number | null {
  const ms =
    value instanceof Date
      ? value.getTime()
      : typeof value === "string"
        ? Date.parse(value)
        : value;
  return typeof ms === "number" && Number.isFinite(ms) && ms > 0 ? ms : null;
}

/**
 * True only for a `creating` row last touched at least 15 minutes ago. A date
 * that cannot be read, or lies in the future, is NOT stuck: never guess.
 */
export function isStuckCreating(
  status: string,
  updatedAt: ClockValue,
  nowMs: number,
): boolean {
  if (status !== CREATING_STATUS) return false;
  const touched = readClock(updatedAt);
  if (touched === null || !Number.isFinite(nowMs)) return false;
  const age = nowMs - touched;
  return age >= 0 && age >= STUCK_CREATING_AFTER_MS;
}

/** isStuckCreating against the wall clock, for components that render a row. */
export function isStuckCreatingNow(
  status: string,
  updatedAt: ClockValue,
  clock: () => number = Date.now,
): boolean {
  return isStuckCreating(status, updatedAt, clock());
}

/** Does this row wait for the seller (timed out, or stuck in creating)? */
export function needsSellerDecision(
  status: string,
  updatedAt: ClockValue,
  nowMs: number,
): boolean {
  return (
    status === RECONCILIATION_STATUS || isStuckCreating(status, updatedAt, nowMs)
  );
}

export function stuckCreatingCutoff(nowMs: number): Date {
  return new Date(nowMs - STUCK_CREATING_AFTER_MS);
}

/**
 * The status part of a claim. The transaction repeats the stuck test in SQL
 * (updatedAt <= cutoff) so a booking that finishes or is touched meanwhile is
 * never reconciled underneath itself.
 */
export function claimStatusFilter(
  status: string,
  nowMs: number,
): { status: string } | { status: string; updatedAt: { lte: Date } } {
  return status === CREATING_STATUS
    ? { status, updatedAt: { lte: stuckCreatingCutoff(nowMs) } }
    : { status };
}

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
 * `reconciliation_required` (and `creating` once it is stuck, which the caller
 * proves with isStuckCreating) may use these; every other status is refused.
 */
export function nextDeliveryStatus(
  current: string,
  action: ReconcileAction,
  stuckCreating = false,
): ReconcileNext {
  const awaiting =
    current === RECONCILIATION_STATUS ||
    (current === CREATING_STATUS && stuckCreating);
  if (!awaiting || !isReconcileAction(action)) {
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
  current: {
    status: string;
    trackingNumber: string | null;
    updatedAt?: ClockValue;
  },
  request: ReconcileRequest,
  nowMs?: number,
): ReconcilePlan {
  const saved = current.trackingNumber ? current.trackingNumber : null;
  const stuck =
    nowMs !== undefined && isStuckCreating(current.status, current.updatedAt, nowMs);
  if (request.action === "courier-has-it") {
    if (saved !== null && saved !== request.tracking) {
      throw new DeliveryTrackingMismatchError(current.status);
    }
    if (
      current.status !== RECONCILIATION_STATUS &&
      current.status !== CREATING_STATUS &&
      saved !== null
    ) {
      return { kind: "noop" };
    }
    return {
      kind: "apply",
      next: nextDeliveryStatus(current.status, request.action, stuck),
    };
  }
  if (saved !== null) {
    throw new DeliveryReconcileRefusedError(current.status, request.action);
  }
  return {
    kind: "apply",
    next: nextDeliveryStatus(current.status, request.action, stuck),
  };
}
