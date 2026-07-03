/**
 * Order change ledger service (Phase 4 — Medusa pattern).
 *
 * Every mutation on an order writes an OrderChange entry. This is the
 * append-only audit trail that powers the order detail timeline.
 *
 * The ledger records: who changed what, when, the before/after state,
 * and the action type (item_add, status_change, refund, etc.).
 *
 * For the edit-then-confirm flow (Phase 4 future), entries start as
 * "pending" and move to "confirmed" or "declined". For immediate changes
 * (the common case), entries are "confirmed" at creation.
 */
import "server-only";
import { db } from "@/lib/db";

export interface OrderChangeEntry {
  orderId: string;
  actionType: string;
  actor?: string;
  payload?: Record<string, unknown>;
  status?: string;
}

/** Record an order change (append-only). Best-effort — never throws. */
export async function recordOrderChange(entry: OrderChangeEntry): Promise<void> {
  try {
    await db.orderChange.create({
      data: {
        orderId: entry.orderId,
        actionType: entry.actionType,
        actor: entry.actor ?? "user",
        status: entry.status ?? "confirmed",
        payload: entry.payload ? JSON.stringify(entry.payload) : null,
      },
    });
  } catch {
    // Best-effort: the business operation already succeeded; the ledger
    // entry is for audit/timeline, not for transactional integrity.
  }
}

/** Get the full timeline for an order (newest first). */
export async function getOrderTimeline(orderId: string, limit = 50) {
  try {
    return await db.orderChange.findMany({
      where: { orderId },
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(limit, 1), 200),
    });
  } catch {
    return [];
  }
}

/** Convenience: record a status change with before→after. */
export async function recordStatusChange(
  orderId: string,
  from: string,
  to: string,
  actor = "user",
): Promise<void> {
  await recordOrderChange({
    orderId,
    actionType: "status_change",
    actor,
    payload: { from, to },
  });
}

/** Convenience: record a refund. */
export async function recordRefund(
  orderId: string,
  refundId: string,
  amount: number,
  method: string,
  actor = "user",
): Promise<void> {
  await recordOrderChange({
    orderId,
    actionType: "refund",
    actor,
    payload: { refundId, amount, method },
  });
}
