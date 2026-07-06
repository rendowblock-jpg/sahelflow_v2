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

/** Mark an order's COD as collected (courier picked up the cash). */
export async function markCodCollected(orderId: string, actor = "user") {
  // Session 30 (AUDIT-2 A2): idempotency — if already collected, no-op.
  const existing = await db.order.findUnique({
    where: { id: orderId },
    select: { codCollected: true, totalPrice: true, orderNumber: true, codCollectedAt: true },
  });
  if (!existing) throw new Error("Order not found");
  if (existing.codCollected) {
    // Already collected — return current state without writing a duplicate ledger entry
    return {
      id: orderId,
      orderNumber: existing.orderNumber,
      totalPrice: existing.totalPrice,
      codCollected: true,
      codCollectedAt: existing.codCollectedAt,
    };
  }

  const order = await db.order.update({
    where: { id: orderId },
    data: {
      codCollected: true,
      codCollectedAt: new Date(),
    },
    select: { id: true, orderNumber: true, totalPrice: true, codCollected: true, codCollectedAt: true },
  });

  await recordOrderChange({
    orderId,
    actionType: "cod_collected",
    actor,
    payload: { amount: order.totalPrice },
  });

  void logAudit({
    action: "order.cod.collected",
    entity: "order",
    entityId: orderId,
    actor,
    after: { codCollected: true, codCollectedAt: order.codCollectedAt },
  });

  return order;
}

/** Mark an order's COD as remitted (courier paid the seller). */
export async function markCodRemitted(orderId: string, remittanceRef: string, actor = "user") {
  // Session 30 (AUDIT-2 A2): idempotency + collected-before-remitted check.
  const existing = await db.order.findUnique({
    where: { id: orderId },
    select: { codCollected: true, codRemitted: true, totalPrice: true, orderNumber: true, codRemittedAt: true, codRemittanceRef: true },
  });
  if (!existing) throw new Error("Order not found");
  if (!existing.codCollected) {
    throw new Error("Cannot mark COD as remitted before it is collected");
  }
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

  const order = await db.order.update({
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
  });

  void logAudit({
    action: "order.cod.remitted",
    entity: "order",
    entityId: orderId,
    actor,
    after: { codRemitted: true, codRemittedAt: order.codRemittedAt, codRemittanceRef: order.codRemittanceRef },
  });

  return order;
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

  // Record ledger entries only for actually-affected orders
  for (const id of affectedIds) {
    void recordOrderChange({
      orderId: id,
      actionType: "cod_remitted",
      actor,
      payload: { remittanceRef, bulk: true },
    });
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
