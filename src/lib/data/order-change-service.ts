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
import { redactPii } from "@/lib/redact-pii";

// Session 30 (AUDIT-3 S2): callers may pass a transaction client so the
// ledger entry participates in the same tx as the mutation. If omitted,
// falls back to the outer db client (legacy behavior).
type DbOrTx = typeof db | Parameters<Parameters<typeof db["$transaction"]>[0]>[0];

export interface OrderChangeEntry {
  orderId: string;
  actionType: string;
  actor?: string;
  payload?: Record<string, unknown>;
  status?: string;
  /** Optional transaction client — if provided, ledger entry is written in-tx. */
  tx?: DbOrTx;
}

/** Record an order change (append-only). Best-effort — never throws. */
export async function recordOrderChange(entry: OrderChangeEntry): Promise<void> {
  try {
    const client = entry.tx ?? db;
    await client.orderChange.create({
      data: {
        orderId: entry.orderId,
        actionType: entry.actionType,
        actor: entry.actor ?? "user",
        status: entry.status ?? "confirmed",
        // Session 30 (AUDIT-4 D6): redact PII before persisting
        payload: entry.payload ? JSON.stringify(redactPii(entry.payload)) : null,
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
