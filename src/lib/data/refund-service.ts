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
import {
  recordOrderChangeInTx,
  recordRefundInTx,
  type OrderChangeTransactionClient,
  type RefundMutationFacts,
} from "./order-change-service";
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

function parseLedgerPayload(payload: string | null): Record<string, unknown> | null {
  if (!payload) return null;
  try {
    const parsed = JSON.parse(payload) as unknown;
    return parsed && typeof parsed === "object"
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

async function returnTransitionRefundId(
  tx: OrderChangeTransactionClient,
  orderId: string,
): Promise<string | null> {
  const changes = await tx.orderChange.findMany({
    where: { orderId, actionType: "status_change" },
    select: { payload: true },
    orderBy: { createdAt: "desc" },
  });
  for (const change of changes) {
    const payload = parseLedgerPayload(change.payload);
    if (payload?.to !== "returned") continue;
    if (payload.from !== "delivered" || payload.reason !== "refund") return null;
    if (typeof payload.refundId !== "string") {
      throw new Error("Cannot safely refund returned order: refund transition identity is missing");
    }
    return payload.refundId;
  }
  throw new Error("Cannot safely refund returned order: return transition fact is missing");
}

export async function createRefund(context: ServiceContext, input: CreateRefundInput) {
  const db = context.prisma;
  if (!Number.isSafeInteger(input.amount) || input.amount < 1) {
    throw new Error("Refund amount must be a positive integer");
  }

  const result = await db.$transaction(async (tx) => {
    if (input.idempotencyKey) {
      const existing = await tx.refund.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (existing) {
        if (
          existing.orderId !== input.orderId ||
          existing.amount !== input.amount ||
          existing.method !== input.method
        ) {
          throw new Error("Idempotency key is already bound to a different refund");
        }
        return { refund: existing, created: false };
      }
    }

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

    let totalSpentAdjusted = true;
    if (order.status === "returned") {
      const transitionRefundId = await returnTransitionRefundId(tx, input.orderId);
      if (transitionRefundId) {
        const transitionRefund = await tx.refund.findFirst({
          where: {
            id: transitionRefundId,
            orderId: input.orderId,
            reversed: false,
          },
          select: { id: true },
        });
        if (!transitionRefund) {
          throw new Error(
            "Cannot safely refund returned order: transition refund is missing or reversed",
          );
        }
      }
      totalSpentAdjusted = transitionRefundId !== null;
    }

    const facts: RefundMutationFacts = {
      statusChanged: order.status === "delivered",
      stockRestored: order.status === "delivered",
      orderCountAdjusted: order.status === "delivered",
      totalSpentAdjusted,
    };

    const created = await tx.refund.create({
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

    if (facts.statusChanged) {
      await tx.order.update({
        where: { id: input.orderId },
        data: { status: "returned" },
      });

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

      await tx.customer.update({
        where: { id: order.customerId },
        data: { orderCount: { decrement: 1 } },
      });
      await recordOrderChangeInTx(tx, {
        orderId: input.orderId,
        actionType: "status_change",
        actor: input.actor,
        payload: {
          from: "delivered",
          to: "returned",
          reason: "refund",
          refundId: created.id,
        },
      });
    }

    if (facts.totalSpentAdjusted) {
      await tx.customer.update({
        where: { id: order.customerId },
        data: { totalSpent: { decrement: input.amount } },
      });
    }

    await recordRefundInTx(
      tx,
      input.orderId,
      created.id,
      input.amount,
      input.method,
      input.actor,
      facts,
    );

    return { refund: created, created: true };
  });

  if (result.created) {
    void logAudit(context, {
      action: "order.refunded",
      entity: "order",
      entityId: input.orderId,
      actor: input.actor ?? "user",
      after: { refundId: result.refund.id, amount: input.amount, method: input.method },
    });
  }

  return result.refund;
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
 * Compensation uses the identity-bound facts stored in that refund's
 * OrderChange payload. Legacy refunds without those facts fail closed rather
 * than guessing from timestamps or current state.
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

  const reversed = await db.$transaction(async (tx) => {
    const refund = await tx.refund.findUnique({
      where: { id: refundId },
      select: {
        id: true,
        orderId: true,
        amount: true,
        method: true,
        reversed: true,
        reversedAt: true,
        order: { select: { customerId: true, status: true } },
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

    const refundChanges = await tx.orderChange.findMany({
      where: { orderId: refund.orderId, actionType: "refund" },
      select: { payload: true },
      orderBy: { createdAt: "desc" },
    });
    const matchingFacts = refundChanges.flatMap((change) => {
      const payload = parseLedgerPayload(change.payload);
      if (payload?.refundId !== refundId) return [];
      if (
        typeof payload.statusChanged !== "boolean" ||
        typeof payload.stockRestored !== "boolean" ||
        typeof payload.orderCountAdjusted !== "boolean" ||
        typeof payload.totalSpentAdjusted !== "boolean"
      ) {
        return [];
      }
      return [{
        statusChanged: payload.statusChanged,
        stockRestored: payload.stockRestored,
        orderCountAdjusted: payload.orderCountAdjusted,
        totalSpentAdjusted: payload.totalSpentAdjusted,
      }];
    });
    const facts = matchingFacts[0];
    if (matchingFacts.length !== 1 || !facts) {
      throw new Error(
        `Cannot safely reverse refund ${refundId}: expected one identity-bound compensation record`,
      );
    }

    if (facts.statusChanged) {
      const otherActiveRefunds = await tx.refund.count({
        where: { orderId: refund.orderId, id: { not: refundId }, reversed: false },
      });
      if (otherActiveRefunds > 0) {
        throw new Error(
          `Cannot reverse refund ${refundId} while other active refunds depend on its return transition`,
        );
      }
      if (refund.order.status !== "returned") {
        throw new Error(
          `Cannot reverse refund ${refundId}: order status is '${refund.order.status}', expected 'returned'`,
        );
      }
    }

    await tx.refund.update({
      where: { id: refundId },
      data: { reversed: true, reversedAt: new Date() },
    });

    if (facts.stockRestored) {
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
    }

    if (facts.orderCountAdjusted) {
      await tx.customer.update({
        where: { id: refund.order.customerId },
        data: { orderCount: { increment: 1 } },
      });
    }

    if (facts.totalSpentAdjusted) {
      await tx.customer.update({
        where: { id: refund.order.customerId },
        data: { totalSpent: { increment: refund.amount } },
      });
    }

    if (facts.statusChanged) {
      await tx.order.update({
        where: { id: refund.orderId },
        data: { status: "delivered" },
      });
      await recordOrderChangeInTx(tx, {
        orderId: refund.orderId,
        actionType: "status_change",
        actor,
        payload: {
          from: "returned",
          to: "delivered",
          reason: "refund_reversal",
          refundId,
        },
      });
    }

    await recordOrderChangeInTx(tx, {
      orderId: refund.orderId,
      actionType: "refund_reversed",
      actor,
      payload: {
        refundId,
        amount: refund.amount,
        method: refund.method,
        reason: opts?.reason ?? null,
        ...facts,
      },
    });

    return { refund, facts };
  });

  void logAudit(context, {
    action: "order.refund_reversed",
    entity: "order",
    entityId: reversed.refund.orderId,
    actor,
    after: {
      refundId,
      amount: reversed.refund.amount,
      method: reversed.refund.method,
      ...reversed.facts,
    },
    metadata: { reason: opts?.reason ?? null },
  });
}
