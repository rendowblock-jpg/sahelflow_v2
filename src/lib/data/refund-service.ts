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
}

export async function createRefund(input: CreateRefundInput) {
  const refund = await db.refund.create({
    data: {
      orderId: input.orderId,
      amount: input.amount,
      method: input.method,
      reason: input.reason ?? null,
      returnId: input.returnId ?? null,
      createdBy: input.actor ?? "user",
    },
  });

  // Record in the order change ledger (for the timeline)
  await recordRefund(input.orderId, refund.id, input.amount, input.method, input.actor);

  // Audit log
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
