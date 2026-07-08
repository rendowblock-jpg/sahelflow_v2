/**
 * Refund service (Phase 4).
 *
 * Creates refunds linked to orders. Supports partial refunds (multiple per
 * order) and different methods (cash, credit, bank, courier_deduction).
 *
 * Each refund also writes an OrderChange ledger entry (actionType: "refund")
 * so it appears in the order timeline.
 */
import "server-only";
import { db } from "@/lib/db";
import { recordRefund } from "./order-change-service";
import { logAudit } from "@/lib/audit";

export interface CreateRefundInput {
  orderId: string;
  amount: number;
  method: "cash" | "credit" | "bank" | "courier_deduction";
  reason?: string;
  returnId?: string;
  actor?: string;
  /** Session 30 (AUDIT-3 S3): idempotency key — same key = no-op on retry. */
  idempotencyKey?: string;
  /** Optional bank/courier reference number. */
  reference?: string;
}

export async function createRefund(input: CreateRefundInput) {
  // Session 30 (AUDIT-3 S3): idempotency — if idempotencyKey provided and a
  // refund with that key already exists, return the existing refund (no-op).
  if (input.idempotencyKey) {
    const existing = await db.refund.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      return existing;
    }
  }

  // Transactional: refund create + order-change ledger + (optional) status
  // transition must all succeed together.
  //
  // F-H3 (TOCTOU for concurrent partial refunds): Prisma's interactive
  // $transaction on SQLite serializes via the single-writer lock (per
  // src/lib/automations/engine.ts:445 comment) — two concurrent createRefund
  // calls can't both pass the over-refund guard with stale priorRefunds=0.
  // The previous explicit `BEGIN IMMEDIATE` wrapper was redundant AND broken:
  // it acquired the write lock on one pooled connection, then $transaction
  // tried to start its own transaction on another connection, deadlocking
  // (PrismaClientUnknownRequestError "SQL error or missing database").
  // Removed in Phase 1 bug 1.1 — required for the regression test to run.
  const refund = await db.$transaction(async (tx) => {
    // 1. Re-read the order inside the tx (TOCTOU-safe)
    const order = await tx.order.findUnique({
      where: { id: input.orderId },
      select: { id: true, status: true, totalPrice: true, deletedAt: true, customerId: true },
    });
    if (!order || order.deletedAt) {
      throw new Error("Order not found");
    }

    // 2. Status check — cannot refund a draft or already-cancelled order
    if (order.status === "draft") {
      throw new Error("Cannot refund a draft order (no payment was collected)");
    }
    if (order.status === "cancelled") {
      throw new Error("Cannot refund a cancelled order");
    }

    // 3. Over-refund guard — total refunds must not exceed order total
    const priorRefunds = await tx.refund.findMany({
      where: { orderId: input.orderId, status: { in: ["completed", "pending"] } },
      select: { amount: true },
    });
    const alreadyRefunded = priorRefunds.reduce((sum, r) => sum + r.amount, 0);
    if (alreadyRefunded + input.amount > order.totalPrice) {
      throw new Error(
        `Refund would exceed order total: already refunded ${alreadyRefunded}, ` +
        `attempting ${input.amount}, order total ${order.totalPrice}`,
      );
    }

    // 4. Status transition + stock restore + orderCount reversal.
    //
    // Phase 1 bug 1.1 (Return + Refund double-counting): if the order is
    // ALREADY "returned" (because a Return was completed first via
    // /api/returns/[id], which now routes through
    // orderService.updateStatus("returned")), the stock + orderCount + totalSpent
    // side effects have ALREADY been applied by that flow. Re-applying them here
    // would double-count. So we skip the inline transition entirely — only the
    // Refund row + the totalSpent decrement (step 8, by the refund amount) need
    // to run.
    //
    // If order.status === "delivered" (no Return was completed first), we still
    // do the inline transition here (AUDIT-3 S4: COD reconciliation must stop
    // counting it as collected+remitted) + restore stock + decrement orderCount.
    // totalSpent is decremented separately in step 8 below by the refund amount.
    // Phase 1 bug 1.1: when the order is already "returned" (Return completed
    // first via /api/returns/[id] → orderService.updateStatus("returned")),
    // the Return flow has ALREADY:
    //   - restored stock
    //   - decremented customer.orderCount
    //   - decremented customer.totalSpent by order.totalPrice (the full order)
    // So this Refund must NOT re-apply any of those — it only records the
    // Refund row. In particular, step 8's totalSpent-by-refund-amount
    // decrement must be skipped (otherwise totalSpent drifts negative for a
    // full refund: -order.totalPrice - refund.amount).
    let statusChanged = false;
    let skipTotalSpentDecrement = false;
    if (order.status === "delivered") {
      await tx.order.update({
        where: { id: input.orderId },
        data: { status: "returned" },
      });
      statusChanged = true;

      // F-H1: restore stock for each item with a productId.
      const items = await tx.orderItem.findMany({
        where: { orderId: input.orderId, productId: { not: null } },
        select: { productId: true, quantity: true },
      });
      for (const item of items) {
        if (item.productId) {
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: { increment: item.quantity } },
          });
        }
      }

      // SV-M3: decrement the customer's orderCount — the order is no longer
      // "completed" (it's now returned). totalSpent is decremented separately
      // in step 8 below by the refund amount (which can be partial — for a
      // full refund it equals order.totalPrice, for a partial refund the
      // remaining amount stays in totalSpent as "real" revenue from the
      // portion that wasn't refunded). Best-effort: customer may be soft-deleted.
      await tx.customer.update({
        where: { id: order.customerId },
        data: { orderCount: { decrement: 1 } },
      }).catch(() => {
        // best-effort — customer row might be soft-deleted
      });
    } else if (order.status === "returned") {
      // Phase 1 bug 1.1: Return flow already did stock restore + orderCount
      // reversal + totalSpent-by-order.totalPrice reversal (via
      // orderService.updateStatus). Skip the inline transition here, AND
      // skip step 8's totalSpent-by-refund-amount decrement — otherwise
      // totalSpent would be decremented twice (once by the Return flow's
      // order.totalPrice, once by the Refund flow's refund.amount). Only
      // the Refund row + the order-change ledger entry should be created.
      statusChanged = false;
      skipTotalSpentDecrement = true;
    }

    // 5. Create the refund row
    const r = await tx.refund.create({
      data: {
        orderId: input.orderId,
        amount: input.amount,
        method: input.method,
        reason: input.reason ?? null,
        returnId: input.returnId ?? null,
        createdBy: input.actor ?? "user",
        status: "completed",
        idempotencyKey: input.idempotencyKey ?? null,
        processedAt: new Date(),
        reference: input.reference ?? null,
      },
    });

    // 6. Record in the order change ledger — same tx (F-H2: pass tx so the
    // ledger entry participates in this refund tx; if the tx rolls back, the
    // ledger entry rolls back too — no orphan refund records.)
    await recordRefund(input.orderId, r.id, input.amount, input.method, input.actor, tx);

    // 7. If status changed, also record the status_change ledger entry
    if (statusChanged) {
      await tx.orderChange.create({
        data: {
          orderId: input.orderId,
          actionType: "status_change",
          actor: input.actor ?? "user",
          status: "confirmed",
          payload: JSON.stringify({ from: "delivered", to: "returned", reason: "refund" }),
        },
      });
    }

    // 8. Customer stats reversal — decrement totalSpent by the refund amount.
    // Phase 4 spec required this but it was never implemented. We only
    // adjust totalSpent (not orderCount) since the order still happened.
    // Phase 1 bug 1.1: SKIP this when the order was already "returned" —
    // the Return flow already decremented totalSpent by order.totalPrice
    // (the full order), so a second decrement by refund.amount would
    // double-count.
    if (!skipTotalSpentDecrement) {
      await tx.customer.update({
        where: { id: order.customerId },
        data: { totalSpent: { decrement: input.amount } },
      }).catch(() => {
        // best-effort — customer row might be soft-deleted
      });
    }

    return r;
  });

  // Audit log (outside tx — fire-and-forget, never blocks the refund)
  void logAudit({
    action: "order.refunded",
    entity: "order",
    entityId: input.orderId,
    actor: input.actor ?? "user",
    after: { refundId: refund.id, amount: input.amount, method: input.method },
  });

  return refund;
}

/** Get all refunds for an order (newest first). */
export async function getRefundsForOrder(orderId: string) {
  return db.refund.findMany({
    where: { orderId },
    orderBy: { createdAt: "desc" },
  });
}

/** Get total refunded amount for an order. */
export async function getTotalRefunded(orderId: string): Promise<number> {
  const refunds = await db.refund.findMany({
    where: { orderId },
    select: { amount: true },
  });
  return refunds.reduce((sum, r) => sum + r.amount, 0);
}
