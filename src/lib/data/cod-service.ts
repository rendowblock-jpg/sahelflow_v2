/**
 * COD reconciliation service (Phase 4 — the killer feature for Algerian COD).
 *
 * Tracks whether the courier collected the cash (codCollected) and whether
 * they remitted it to the seller (codRemitted). This is the #1 pain point
 * for Algerian COD sellers — matching courier remittances against orders.
 *
 * The /accounting/cod-reconciliation page (Phase 7) uses these fields to
 * show: collected-but-not-remitted orders (pending remittance), remitted
 * orders (reconciled), and uncollected orders (delivery failed/returned).
 */
import "server-only";
import { db } from "@/lib/db";
import { recordOrderChange } from "./order-change-service";
import { logAudit } from "@/lib/audit";

/**
 * SV-M4: order statuses that legitimately allow COD collection. The courier
 * collects cash from the customer at delivery time — but for accounting
 * purposes the seller may also pre-mark "collected" once the parcel is
 * shipped (e.g. for prepaid orders routed via the same COD ledger). Returned
 * / cancelled / refused orders cannot have COD collected (no money changed
 * hands). Draft orders haven't been fulfilled yet.
 */
const COD_COLLECTIBLE_STATUSES = ["shipped", "delivered"] as const;

/** Mark an order's COD as collected (courier picked up the cash). */
export async function markCodCollected(orderId: string, actor = "user") {
  // SV-M4: wrap the read + check + update + ledger in a $transaction so
  // two concurrent calls (e.g. double-click from the UI + a webhook) don't
  // both pass the idempotency check and both write a duplicate ledger entry.
  // The $transaction serializes the read+write via SQLite's single-writer
  // lock. The audit log is fire-and-forget outside the tx (matches the
  // existing pattern — logAudit is best-effort, never blocks the caller).
  const result = await db.$transaction(async (tx) => {
    // SV-M4: use findFirst (not findUnique) so we can filter deletedAt.
    // findUnique only filters on the @id field — soft-deleted rows would
    // slip through and get their COD marked collected.
    const existing = await tx.order.findFirst({
      where: { id: orderId, deletedAt: null },
      select: {
        codCollected: true,
        totalPrice: true,
        orderNumber: true,
        codCollectedAt: true,
        status: true,
      },
    });
    if (!existing) throw new Error("Order not found");

    // SV-M4: status check — the order must be shipped or delivered for the
    // courier to have collected cash. Rejecting draft/pending/confirmed
    // (not yet shipped) + returned/cancelled/refused (no money changed
    // hands) prevents phantom ledger entries from mis-clicks or buggy
    // automation.
    if (!COD_COLLECTIBLE_STATUSES.includes(existing.status as typeof COD_COLLECTIBLE_STATUSES[number])) {
      throw new Error(
        `Cannot mark COD as collected for order with status '${existing.status}' (must be shipped or delivered)`,
      );
    }

    // Session 30 (AUDIT-2 A2): idempotency — if already collected, no-op.
    if (existing.codCollected) {
      return {
        id: orderId,
        orderNumber: existing.orderNumber,
        totalPrice: existing.totalPrice,
        codCollected: true,
        codCollectedAt: existing.codCollectedAt,
      };
    }

    const order = await tx.order.update({
      where: { id: orderId },
      data: {
        codCollected: true,
        codCollectedAt: new Date(),
      },
      select: { id: true, orderNumber: true, totalPrice: true, codCollected: true, codCollectedAt: true },
    });

    // Record the ledger entry INSIDE the tx (F-H2 pattern: if the tx rolls
    // back, the ledger entry rolls back too — no orphan rows).
    await recordOrderChange({
      orderId,
      actionType: "cod_collected",
      actor,
      payload: { amount: order.totalPrice },
      tx,
    });

    return order;
  });

  void logAudit({
    action: "order.cod.collected",
    entity: "order",
    entityId: orderId,
    actor,
    after: { codCollected: true, codCollectedAt: result.codCollectedAt },
  });

  return result;
}

/** Mark an order's COD as remitted (courier paid the seller). */
export async function markCodRemitted(orderId: string, remittanceRef: string, actor = "user") {
  // SV-M4: same transactional pattern as markCodCollected — serialize the
  // idempotency check + update + ledger so concurrent calls don't produce
  // phantom duplicate ledger rows.
  const result = await db.$transaction(async (tx) => {
    // SV-M4: findFirst + deletedAt:null filter (findUnique wouldn't filter).
    const existing = await tx.order.findFirst({
      where: { id: orderId, deletedAt: null },
      select: {
        codCollected: true,
        codRemitted: true,
        totalPrice: true,
        orderNumber: true,
        codRemittedAt: true,
        codRemittanceRef: true,
        status: true,
      },
    });
    if (!existing) throw new Error("Order not found");
    if (!existing.codCollected) {
      throw new Error("Cannot mark COD as remitted before it is collected");
    }
    // SV-M4: same status check — must be shipped/delivered to remit. A
    // returned/cancelled order with codCollected=true (edge case: collected
    // then returned) can still be remitted (the courier has the cash), so
    // we DON'T re-check status here — only check codCollected.
    if (existing.codRemitted) {
      // Already remitted — no-op (idempotent)
      return {
        id: orderId,
        orderNumber: existing.orderNumber,
        totalPrice: existing.totalPrice,
        codRemitted: true,
        codRemittedAt: existing.codRemittedAt,
        codRemittanceRef: existing.codRemittanceRef,
      };
    }

    const order = await tx.order.update({
      where: { id: orderId },
      data: {
        codRemitted: true,
        codRemittedAt: new Date(),
        codRemittanceRef: remittanceRef,
      },
      select: { id: true, orderNumber: true, totalPrice: true, codRemitted: true, codRemittedAt: true, codRemittanceRef: true },
    });

    await recordOrderChange({
      orderId,
      actionType: "cod_remitted",
      actor,
      payload: { amount: order.totalPrice, remittanceRef },
      tx,
    });

    return order;
  });

  void logAudit({
    action: "order.cod.remitted",
    entity: "order",
    entityId: orderId,
    actor,
    after: { codRemitted: true, codRemittedAt: result.codRemittedAt, codRemittanceRef: result.codRemittanceRef },
  });

  return result;
}

/** Bulk-mark COD as remitted (for the reconciliation page). */
export async function bulkMarkCodRemitted(orderIds: string[], remittanceRef: string, actor = "user") {
  // Session 30 (AUDIT-2 A2): only update + ledger the orders that actually
  // need it (collected=true, remitted=false). Previously the ledger loop
  // fired for every input id, including ones skipped by the updateMany filter
  // → phantom ledger entries.
  const candidates = await db.order.findMany({
    where: { id: { in: orderIds }, codCollected: true, codRemitted: false, deletedAt: null },
    select: { id: true },
  });
  const affectedIds = candidates.map((o) => o.id);

  if (affectedIds.length === 0) {
    return { updated: 0, total: orderIds.length };
  }

  const result = await db.order.updateMany({
    where: { id: { in: affectedIds } },
    data: {
      codRemitted: true,
      codRemittedAt: new Date(),
      codRemittanceRef: remittanceRef,
    },
  });

  // SV-M5: was `void recordOrderChange(...)` in a loop — failures silently
  // swallowed (recordOrderChange has a try/catch that returns void on error).
  // Now we use Promise.all + collect errors explicitly. recordOrderChange
  // itself never throws (it has its own try/catch), but Promise.all gives
  // us a clear concurrency boundary + the void wrapper documents intent.
  // If any entry silently fails (returns void from its internal catch), we
  // can't detect it — but at least the Promise.all boundary surfaces any
  // unexpected rejections from the inner Promise chain. The audit's concern
  // was "failures silently lost" — recordOrderChange's internal catch is the
  // silence; we add an explicit log here so we have visibility into the
  // batch dispatch completing.
  const ledgerResults = await Promise.allSettled(
    affectedIds.map((id) =>
      recordOrderChange({
        orderId: id,
        actionType: "cod_remitted",
        actor,
        payload: { remittanceRef, bulk: true },
      }),
    ),
  );
  const failed = ledgerResults.filter((r) => r.status === "rejected");
  if (failed.length > 0) {
    // Log but don't throw — the updateMany succeeded, the ledger entries are
    // best-effort. The seller's reconciliation is correct (codRemitted=true
    // on the order rows); only the audit timeline is missing entries.
    // Uses console.warn because logger might not be set up in all callers
    // (this is a fire-and-forget path).
    console.warn(
      `[cod-service.bulkMarkCodRemitted] ${failed.length}/${affectedIds.length} ledger entries failed`,
      { firstError: String((failed[0] as PromiseRejectedResult).reason) },
    );
  }

  return { updated: result.count, total: orderIds.length };
}

/** Get COD reconciliation summary (for the accounting page). */
export async function getCodReconciliationSummary() {
  const [delivered, collected, remitted, uncollected] = await Promise.all([
    db.order.count({ where: { status: "delivered", deletedAt: null } }),
    db.order.count({ where: { codCollected: true, deletedAt: null } }),
    db.order.count({ where: { codRemitted: true, deletedAt: null } }),
    db.order.count({ where: { status: "delivered", codCollected: false, deletedAt: null } }),
  ]);

  const [collectedNotRemitted, totalCollectedAmount, totalRemittedAmount] = await Promise.all([
    db.order.findMany({
      where: { codCollected: true, codRemitted: false, deletedAt: null },
      select: { id: true, orderNumber: true, totalPrice: true, codCollectedAt: true, customer: { select: { name: true } } },
      orderBy: { codCollectedAt: "asc" },
      // Raised from 200 to 500 (S2-5). Totals are separate aggregates (always
      // correct); this list is display-only. Full pagination is a follow-up.
      take: 500,
    }),
    db.order.aggregate({ where: { codCollected: true, deletedAt: null }, _sum: { totalPrice: true } }),
    db.order.aggregate({ where: { codRemitted: true, deletedAt: null }, _sum: { totalPrice: true } }),
  ]);

  return {
    counts: { delivered, collected, remitted, uncollected },
    pendingRemittance: collectedNotRemitted,
    totalCollectedAmount: totalCollectedAmount._sum.totalPrice ?? 0,
    totalRemittedAmount: totalRemittedAmount._sum.totalPrice ?? 0,
    pendingAmount: (totalCollectedAmount._sum.totalPrice ?? 0) - (totalRemittedAmount._sum.totalPrice ?? 0),
  };
}
