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
import type { DbClient } from "@/lib/db";
import type { ServiceContext } from "@/lib/data/service-base";
import { redactPii } from "@/lib/redact-pii";

export type OrderChangeTransactionClient = Parameters<
  Parameters<DbClient["$transaction"]>[0]
>[0];

export interface OrderChangeEntry {
  orderId: string;
  actionType: string;
  actor?: string;
  payload?: Record<string, unknown>;
  status?: string;
}

export interface RefundMutationFacts {
  statusChanged: boolean;
  stockRestored: boolean;
  orderCountAdjusted: boolean;
  totalSpentAdjusted: boolean;
}

function orderChangeData(entry: OrderChangeEntry) {
  return {
    orderId: entry.orderId,
    actionType: entry.actionType,
    actor: entry.actor ?? "user",
    status: entry.status ?? "confirmed",
    payload: entry.payload ? JSON.stringify(redactPii(entry.payload)) : null,
  };
}

/**
 * Strict ledger write for a caller-owned Prisma transaction. There is no
 * fallback client and no catch: a failed ledger write aborts the transaction.
 */
export async function recordOrderChangeInTx(
  tx: OrderChangeTransactionClient,
  entry: OrderChangeEntry,
): Promise<void> {
  await tx.orderChange.create({ data: orderChangeData(entry) });
}

/** Get the full timeline for an order (newest first). */
export async function getOrderTimeline(
  context: ServiceContext,
  orderId: string,
  limit = 50,
) {
  try {
    return await context.prisma.orderChange.findMany({
      where: { orderId },
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(limit, 1), 200),
    });
  } catch {
    return [];
  }
}

/** Record a status transition in the caller's transaction. */
export async function recordStatusChangeInTx(
  tx: OrderChangeTransactionClient,
  orderId: string,
  from: string,
  to: string,
  actor = "user",
): Promise<void> {
  await recordOrderChangeInTx(tx, {
    orderId,
    actionType: "status_change",
    actor,
    payload: { from, to },
  });
}

/** Record a refund in the caller's transaction. */
export async function recordRefundInTx(
  tx: OrderChangeTransactionClient,
  orderId: string,
  refundId: string,
  amount: number,
  method: string,
  actor = "user",
  facts?: RefundMutationFacts,
): Promise<void> {
  await recordOrderChangeInTx(tx, {
    orderId,
    actionType: "refund",
    actor,
    payload: { refundId, amount, method, ...facts },
  });
}
