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
  const result = await db.order.updateMany({
    where: { id: { in: orderIds }, codCollected: true, codRemitted: false },
    data: {
      codRemitted: true,
      codRemittedAt: new Date(),
      codRemittanceRef: remittanceRef,
    },
  });

  // Record ledger entries for each
  for (const id of orderIds) {
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
