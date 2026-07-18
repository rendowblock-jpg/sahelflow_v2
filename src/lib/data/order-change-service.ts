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

// Session 30 (AUDIT-3 S2): callers may pass a transaction client so the
// ledger entry participates in the same tx as the mutation. If omitted,
// falls back to the outer db client (legacy behavior).
type DbOrTx = DbClient | Parameters<Parameters<DbClient["$transaction"]>[0]>[0];

export interface OrderChangeEntry {
  orderId: string;
  actionType: string;
  actor?: string;
  payload?: Record<string, unknown>;
  status?: string;
  /** Optional transaction client — if provided, ledger entry is written in-tx. */
  tx?: DbOrTx;
}

/** Record an order change (append-only). Best-effort — never throws.
 *
 *  W3-23 (Session 39): this is the fire-and-forget variant for post-transaction
 *  use (the business operation already succeeded; the ledger entry is for
 *  audit/timeline, not for transactional integrity). Failures are now LOGGED
 *  via `console.error` instead of silently swallowed — a DB-down or schema-
 *  mismatch issue that drops ledger entries will at least leave a trace in
 *  the server logs.
 *
 *  For use INSIDE a Prisma `$transaction` (where the ledger entry MUST
 *  participate atomically in the caller's tx — if the ledger write fails,
 *  the whole tx should roll back), use `recordOrderChangeInTx` instead.
 *  That variant does NOT catch errors.
 */
export async function recordOrderChange(
  context: ServiceContext,
  entry: OrderChangeEntry,
): Promise<void> {
  try {
    const client = entry.tx ?? context.prisma;
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
  } catch (err) {
    // W3-23: log the error so failures are at least visible in the server
    // logs. The business operation already succeeded; the ledger entry is
    // for audit/timeline, not for transactional integrity — so we still
    // swallow the error (don't crash the caller). But silent swallowing
    // made DB-down + schema-mismatch issues invisible.
    console.error(
      "[recordOrderChange] failed to write ledger entry:",
      {
        orderId: entry.orderId,
        actionType: entry.actionType,
        actor: entry.actor,
      },
      err,
    );
  }
}

/**
 * Record an order change INSIDE a Prisma `$transaction` (W3-23, Session 39).
 *
 * Unlike `recordOrderChange`, this variant does NOT catch errors — if the
 * ledger write fails, the error propagates and the caller's `$transaction`
 * rolls back. This ensures the ledger entry is atomic with the business
 * operation (no orphan mutations without a ledger record).
 *
 * Use this when the ledger entry is part of the transaction's correctness
 * guarantee (e.g. `createRefund` writes a `refund` ledger entry in the same
 * tx as the Refund row — if the ledger write fails, the refund should roll
 * back too, not leave a Refund row with no audit trail).
 *
 * Migration: existing callers that pass `entry.tx` to `recordOrderChange`
 * should switch to this variant for proper atomicity. The convenience
 * wrappers `recordStatusChange` + `recordRefund` below still call the
 * best-effort `recordOrderChange` for backward compat — a future task
 * should migrate them (and their callers) to `recordOrderChangeInTx`.
 *
 * @param tx    The Prisma transaction client (from `db.$transaction(async (tx) => ...)`)
 * @param entry The ledger entry (without the `tx` field — `tx` is passed separately)
 */
export async function recordOrderChangeInTx(
  context: ServiceContext,
  entry: Omit<OrderChangeEntry, "tx">,
): Promise<void> {
  // No try/catch — let errors propagate so the caller's $transaction rolls back.
  await context.prisma.orderChange.create({
    data: {
      orderId: entry.orderId,
      actionType: entry.actionType,
      actor: entry.actor ?? "user",
      status: entry.status ?? "confirmed",
      // Session 30 (AUDIT-4 D6): redact PII before persisting
      payload: entry.payload ? JSON.stringify(redactPii(entry.payload)) : null,
    },
  });
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

/** Convenience: record a status change with before→after.
 *
 *  TODO(W3-23): when `tx` is provided, this should call `recordOrderChangeInTx`
 *  for proper atomicity (so a ledger-write failure rolls back the caller's tx).
 *  Currently it calls the best-effort `recordOrderChange` which swallows
 *  errors even when a tx is passed — the ledger entry may be silently lost.
 *  Migration deferred per task 2-e scope (callers not updated in this batch).
 */
export async function recordStatusChange(
  context: ServiceContext,
  orderId: string,
  from: string,
  to: string,
  actor = "user",
  /** F-H2: optional tx so the ledger entry participates in the caller's tx. */
  tx?: DbOrTx,
): Promise<void> {
  await recordOrderChange(context, {
    orderId,
    actionType: "status_change",
    actor,
    payload: { from, to },
    tx,
  });
}

/** Convenience: record a refund.
 *
 *  TODO(W3-23): when `tx` is provided, this should call `recordOrderChangeInTx`
 *  for proper atomicity (so a ledger-write failure rolls back the refund tx).
 *  Currently it calls the best-effort `recordOrderChange` which swallows
 *  errors even when a tx is passed — the ledger entry may be silently lost,
 *  leaving a Refund row with no audit trail. Migration deferred per task 2-e
 *  scope (callers not updated in this batch).
 */
export async function recordRefund(
  context: ServiceContext,
  orderId: string,
  refundId: string,
  amount: number,
  method: string,
  actor = "user",
  /** F-H2: optional tx so the ledger entry participates in the refund tx. */
  tx?: DbOrTx,
): Promise<void> {
  await recordOrderChange(context, {
    orderId,
    actionType: "refund",
    actor,
    payload: { refundId, amount, method },
    tx,
  });
}
