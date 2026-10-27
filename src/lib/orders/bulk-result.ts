/**
 * What the orders list tells a seller before and after a bulk status change (P5 slice 1).
 *
 * Pure functions, no React, no I/O: the component only draws what these return.
 *
 * Why confirmation exists for exactly two actions. The lifecycle (`ALLOWED_TRANSITIONS`,
 * `src/lib/order-transitions.ts`) lets a confirmed order still be cancelled, but `cancelled` is terminal and a
 * `shipped` order cannot be cancelled at all. So after a bulk ship or a bulk cancel nothing can bring the orders back
 * to pending or confirmed. An "Undo" for those would be untrue; asking first, and saying what will happen, is the
 * honest guard. A test derives this from the lifecycle table so a change to the lifecycle cannot silently outdate it.
 */
import type { OrderStatus } from "@/types/domain";

/** Bulk targets that cannot be walked back to pending or confirmed. */
export const BULK_CONFIRMATION_STATUSES: readonly OrderStatus[] = ["shipped", "cancelled"];

export function bulkNeedsConfirmation(status: OrderStatus): boolean {
  return BULK_CONFIRMATION_STATUSES.includes(status);
}

export type BulkFailureReason = "invalid_transition" | "not_found" | "other";

export interface BulkFailure {
  id: string;
  /** The order number when the order is on the page the seller is looking at, else null. */
  orderNumber: string | null;
  reason: BulkFailureReason;
}

export interface BulkOutcome {
  succeeded: number;
  failed: BulkFailure[];
  failedIds: string[];
}

/**
 * The reason comes from the stable error `code` the bulk route sends ({ id, error, code }), never from the English
 * `error` text: that text is not meant to be shown (see `translate-server-error.ts`, strategy 1).
 */
function reasonFor(code: unknown): BulkFailureReason {
  if (code === "INVALID_TRANSITION") return "invalid_transition";
  if (code === "NOT_FOUND") return "not_found";
  return "other";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Reads the answer of POST /api/orders/bulk. Returns null when the answer is not the shape the route documents, so
 * the caller can say "could not read the result" instead of reporting a success it cannot see.
 */
export function readBulkOutcome(
  payload: unknown,
  orderNumberById: ReadonlyMap<string, string>,
): BulkOutcome | null {
  if (!isRecord(payload)) return null;
  const { succeeded, failed } = payload;
  if (succeeded !== undefined && !Array.isArray(succeeded)) return null;
  if (failed !== undefined && !Array.isArray(failed)) return null;
  if (succeeded === undefined && failed === undefined) return null;

  const rows: BulkFailure[] = [];
  const seen = new Set<string>();
  for (const entry of (failed ?? []) as unknown[]) {
    const id = typeof entry === "string" ? entry : isRecord(entry) && typeof entry.id === "string" ? entry.id : "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    rows.push({
      id,
      orderNumber: orderNumberById.get(id) ?? null,
      reason: isRecord(entry) ? reasonFor(entry.code) : "other",
    });
  }
  return {
    succeeded: (succeeded ?? []).length,
    failed: rows,
    failedIds: rows.map((row) => row.id),
  };
}

export type OrdersEmptyKind = "filtered" | "status" | "first-use";

/**
 * Which empty state the list shows. A status tab with no orders and no search or filter is not "first use": the shop
 * may have hundreds of orders in other tabs.
 */
export function ordersEmptyKind(input: {
  hasActiveFilters: boolean;
  statusFilter?: OrderStatus | "all";
}): OrdersEmptyKind {
  if (input.hasActiveFilters) return "filtered";
  if (input.statusFilter && input.statusFilter !== "all") return "status";
  return "first-use";
}
