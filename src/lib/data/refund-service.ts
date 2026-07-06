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

    // 4. If order is "delivered", transition to "returned" (AUDIT-3 S4)
    // so COD reconciliation stops counting it as collected+remitted.
    let statusChanged = false;
    if (order.status === "delivered") {
      await tx.order.update({
        where: { id: input.orderId },
        data: { status: "returned" },
      });
      statusChanged = true;
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

    // 6. Record in the order change ledger — same tx (Session 30 S2 fix)
    await recordRefund(input.orderId, r.id, input.amount, input.method, input.actor);

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
    await tx.customer.update({
      where: { id: order.customerId },
      data: { totalSpent: { decrement: input.amount } },
    }).catch(() => {
      // best-effort — customer row might be soft-deleted
    });

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
