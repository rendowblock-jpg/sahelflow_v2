/**
 * Refund service (Phase 4).
 *
 * Creates refunds linked to orders. Supports partial refunds (multiple per
 * order) and different methods (cash, credit, bank, courier_deduction).
 *
 * Each refund also writes an OrderChange ledger entry (actionType: "refund")
 * so it appears in the order timeline.
 *
 * W3-2 (Session 39): added `reverseRefund` to undo a refund issued by
 * mistake. Reversal marks the Refund row `reversed: true` (kept for audit),
 * re-applies customer stats, re-deducts restored stock, and writes an
 * OrderChange entry (actionType: "refund_reversed").
 */
import "server-only";
import type { ServiceContext } from "@/lib/data/service-base";
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

export async function createRefund(context: ServiceContext, input: CreateRefundInput) {
  const db = context.prisma;
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

    // 3. Over-refund guard — total refunds must not exceed order total.
    //    W3-2: exclude reversed refunds (they no longer count toward the
    //    total — a reversed refund is conceptually "undone").
    const priorRefunds = await tx.refund.findMany({
      where: { orderId: input.orderId, status: { in: ["completed", "pending"] }, reversed: false },
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
    await recordRefund(
      context,
      input.orderId,
      r.id,
      input.amount,
      input.method,
      input.actor,
      tx,
    );

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
  void logAudit(context, {
    action: "order.refunded",
    entity: "order",
    entityId: input.orderId,
    actor: input.actor ?? "user",
    after: { refundId: refund.id, amount: input.amount, method: input.method },
  });

  return refund;
}

/** Get all refunds for an order (newest first). Includes reversed refunds
 *  (the UI shows them with a "reversed" badge). Use `getTotalRefunded` for
 *  the effective total that excludes reversed refunds.
 */
export async function getRefundsForOrder(context: ServiceContext, orderId: string) {
  const db = context.prisma;
  return db.refund.findMany({
    where: { orderId },
    orderBy: { createdAt: "desc" },
  });
}

/** Get total refunded amount for an order.
 *  W3-2: excludes reversed refunds (they no longer represent money returned
 *  to the customer).
 */
export async function getTotalRefunded(
  context: ServiceContext,
  orderId: string,
): Promise<number> {
  const db = context.prisma;
  const refunds = await db.refund.findMany({
    where: { orderId, reversed: false },
    select: { amount: true },
  });
  return refunds.reduce((sum, r) => sum + r.amount, 0);
}

export interface ReverseRefundInput {
  /** Optional reason for the reversal (stored in the OrderChange payload + audit log). */
  reason?: string;
  /** Who initiated the reversal. */
  actor?: string;
}

/**
 * Reverse a refund (W3-2, Session 39).
 *
 * Undoes everything `createRefund` did:
 *   - Marks the Refund row as `reversed: true` (kept in the table for audit;
 *     excluded from `getTotalRefunded` and the over-refund guard).
 *   - Re-applies customer stats (increments `totalSpent` by the refund amount,
 *     if `createRefund` decremented it).
 *   - If the refund had restored stock (the `delivered → returned` inline
 *     transition), re-deducts the stock + increments `customer.orderCount` +
 *     flips `order.status` back to "delivered".
 *   - Records an OrderChange ledger entry (actionType: "refund_reversed").
 *
 * Detection of what `createRefund` did (the refund row doesn't store this
 * explicitly, so we re-derive it from the OrderChange ledger + the order's
 * current state):
 *   - The inline `delivered → returned` transition is detected by looking for
 *     a `status_change` OrderChange entry on the same order whose payload is
 *     `{ from: "delivered", to: "returned", reason: "refund" }` (this is what
 *     `createRefund` writes in step 7 when `statusChanged === true`).
 *   - The `customer.totalSpent` decrement (createRefund step 8) is detected
 *     heuristically: if the inline transition ran, step 8 definitely ran.
 *     If the inline transition did NOT run, step 8 was skipped ONLY when the
 *     order was already "returned" at refund time (the `returned` branch with
 *     `skipTotalSpentDecrement = true`). We approximate "order was returned
 *     at refund time" by "order is currently `returned` AND no inline-
 *     transition ledger entry exists".
 *
 *     TODO(W3-2): this heuristic is wrong if the order was transitioned away
 *     from "returned" after a refund-on-already-returned-order (rare — would
 *     require a re-ship after a Return + Refund). A future task should add a
 *     `customerStatsAdjusted Boolean @default(true)` column to the Refund
 *     model, set explicitly in `createRefund`, for a definitive signal.
 *
 * @param refundId  The Refund row id to reverse.
 * @param opts      Optional `reason` + `actor` for the audit trail.
 * @throws if the refund is not found or is already reversed.
 */
export async function reverseRefund(
  context: ServiceContext,
  refundId: string,
  opts?: ReverseRefundInput,
): Promise<void> {
  const db = context.prisma;
  const actor = opts?.actor ?? "user";

  // 1. Read the refund + its order (outside tx — read-only precheck so we
  //    can produce a clear error before opening a tx).
  const refund = await db.refund.findUnique({
    where: { id: refundId },
    select: {
      id: true,
      orderId: true,
      amount: true,
      method: true,
      reversed: true,
      reversedAt: true,
      createdAt: true,
      order: { select: { id: true, customerId: true, status: true } },
    },
  });
  if (!refund) {
    throw new Error(`Refund ${refundId} not found`);
  }
  if (refund.reversed) {
    throw new Error(
      `Refund ${refundId} is already reversed (reversedAt=${refund.reversedAt?.toISOString() ?? "null"})`,
    );
  }

  await db.$transaction(async (tx) => {
    // 2. Re-read inside tx (TOCTOU-safe — two concurrent reverseRefund
    //    calls can't both pass the reversed check with stale state).
    const current = await tx.refund.findUnique({
      where: { id: refundId },
      select: { reversed: true },
    });
    if (current?.reversed) {
      throw new Error(`Refund ${refundId} was reversed concurrently`);
    }

    // 3. Mark the refund as reversed (kept in the table for audit — refunds
    //    are append-only; a reversal is a compensating action, not a delete).
    await tx.refund.update({
      where: { id: refundId },
      data: { reversed: true, reversedAt: new Date() },
    });

    // 4. Detect if createRefund did the inline `delivered → returned`
    //    transition (which also restored stock + decremented orderCount).
    //    Signal: a `status_change` OrderChange on the same order whose
    //    payload is `{ from: "delivered", to: "returned", reason: "refund" }`,
    //    written within ±5 seconds of the refund's createdAt (same tx →
    //    same timestamp, but allow slack for clock skew in test setups).
    const statusChanges = await tx.orderChange.findMany({
      where: {
        orderId: refund.orderId,
        actionType: "status_change",
      },
      select: { payload: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    let inlineTransitionRan = false;
    const refundTime = refund.createdAt.getTime();
    for (const sc of statusChanges) {
      if (!sc.payload) continue;
      if (Math.abs(sc.createdAt.getTime() - refundTime) > 5000) continue;
      try {
        const p = JSON.parse(sc.payload) as {
          from?: string;
          to?: string;
          reason?: string;
        };
        if (p?.from === "delivered" && p?.to === "returned" && p?.reason === "refund") {
          inlineTransitionRan = true;
          break;
        }
      } catch {
        // payload not JSON — skip
      }
    }

    // 5. Reverse the inline-transition side effects (if they ran).
    if (inlineTransitionRan) {
      // 5a. Re-deduct stock for each item with a productId (createRefund
      //     incremented stock — we decrement it back).
      const items = await tx.orderItem.findMany({
        where: { orderId: refund.orderId, productId: { not: null } },
        select: { productId: true, quantity: true },
      });
      for (const item of items) {
        if (item.productId) {
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: { decrement: item.quantity } },
          });
        }
      }

      // 5b. Undo the orderCount decrement (createRefund decremented by 1).
      await tx.customer.update({
        where: { id: refund.order.customerId },
        data: { orderCount: { increment: 1 } },
      }).catch(() => {
        // best-effort — customer row might be soft-deleted
      });

      // 5c. Flip order.status back to "delivered" (best-effort — only if
      //     the order is currently "returned"; if another flow transitioned
      //     it since the refund, leave it alone).
      if (refund.order.status === "returned") {
        await tx.order.update({
          where: { id: refund.orderId },
          data: { status: "delivered" },
        });
      }
    }

    // 6. Reverse the customer.totalSpent decrement (createRefund step 8).
    //    Heuristic: step 8 ran UNLESS the order was already "returned" at
    //    refund time (the `returned` branch with skipTotalSpentDecrement=true).
    //    We approximate "order was returned at refund time" by "order is
    //    currently `returned` AND no inline-transition ledger entry exists"
    //    (if the inline transition ran, the order was `delivered` at refund
    //    time, so step 8 ran). See the function docstring for the known edge
    //    case where this heuristic is wrong.
    const step8Ran = inlineTransitionRan || refund.order.status !== "returned";
    if (step8Ran) {
      await tx.customer.update({
        where: { id: refund.order.customerId },
        data: { totalSpent: { increment: refund.amount } },
      }).catch(() => {
        // best-effort — customer row might be soft-deleted
      });
    }

    // 7. Record the reversal in the order-change ledger (in-tx → atomic
    //    with the reversal; if the tx rolls back, the ledger entry rolls
    //    back too — no orphan reversal records).
    await tx.orderChange.create({
      data: {
        orderId: refund.orderId,
        actionType: "refund_reversed",
        actor,
        status: "confirmed",
        payload: JSON.stringify({
          refundId,
          amount: refund.amount,
          method: refund.method,
          reason: opts?.reason ?? null,
          inlineTransitionReversed: inlineTransitionRan,
          customerStatsReversed: step8Ran,
        }),
      },
    });
  });

  // 8. Audit log (outside tx — fire-and-forget, never blocks the reversal).
  void logAudit(context, {
    action: "order.refund_reversed",
    entity: "order",
    entityId: refund.orderId,
    actor,
    after: { refundId, amount: refund.amount, method: refund.method },
    metadata: { reason: opts?.reason ?? null },
  });
}
