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
 *
 * Golden COD truth (7-b P2, ARCHITECTURE.md §8.6): a PARTIAL refund on a
 * delivered order is a money-only movement — stock stays outbound, the order
 * stays delivered and no delivery truth is rewritten. Only the refund that
 * settles the full receivable performs the legacy delivered→returned
 * physical-return transition, with variant-aware stock restoration. Reversal
 * compensation mirrors the restoration exactly.
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

/**
 * Variant-aware stock restoration for the full-settling legacy refund's
 * delivered→returned transition (7-b P2). Mirrors the legacy confirmation
 * release path in order-service: variant items restore the variant row and
 * re-derive the product's denormalized stock from active variant stock; plain
 * items restore the product row directly.
 */
async function restoreDeliveredStockForFullRefund(
  tx: OrderChangeTransactionClient,
  orderId: string,
): Promise<void> {
  const items = await tx.orderItem.findMany({
    where: { orderId, productId: { not: null } },
    select: { productId: true, productVariantId: true, quantity: true },
  });
  for (const item of items) {
    if (!item.productId) continue;
    if (item.productVariantId) {
      const restored = await tx.productVariant.updateMany({
        where: { id: item.productVariantId, productId: item.productId },
        data: { stock: { increment: item.quantity } },
      });
      if (restored.count !== 1) {
        throw new Error(
          `Variant '${item.productVariantId}' is missing or belongs to another product`,
        );
      }
      const available = await tx.productVariant.aggregate({
        where: { productId: item.productId, isActive: true },
        _sum: { stock: true },
      });
      await tx.product.update({
        where: { id: item.productId },
        data: { stock: available._sum.stock ?? 0 },
      });
    } else {
      await tx.product.update({
        where: { id: item.productId },
        data: { stock: { increment: item.quantity } },
      });
    }
  }
}

/** Exact compensation of `restoreDeliveredStockForFullRefund` on reversal. */
async function deductRestoredStockOnReversal(
  tx: OrderChangeTransactionClient,
  orderId: string,
): Promise<void> {
  const items = await tx.orderItem.findMany({
    where: { orderId, productId: { not: null } },
    select: { productId: true, productVariantId: true, quantity: true },
  });
  for (const item of items) {
    if (!item.productId) continue;
    if (item.productVariantId) {
      const deducted = await tx.productVariant.updateMany({
        where: { id: item.productVariantId, productId: item.productId },
        data: { stock: { decrement: item.quantity } },
      });
      if (deducted.count !== 1) {
        throw new Error(
          `Variant '${item.productVariantId}' is missing or belongs to another product`,
        );
      }
      const available = await tx.productVariant.aggregate({
        where: { productId: item.productId, isActive: true },
        _sum: { stock: true },
      });
      await tx.product.update({
        where: { id: item.productId },
        data: { stock: available._sum.stock ?? 0 },
      });
    } else {
      await tx.product.update({
        where: { id: item.productId },
        data: { stock: { decrement: item.quantity } },
      });
    }
  }
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

    // B7-2: customer stats (orderCount + totalSpent) are incremented only
    // when an order reaches "delivered" (order-transitions.ts). A refund on
    // an order that never delivered — pending/confirmed/shipped/refused —
    // previously defaulted totalSpentAdjusted=true and debited stats that
    // were never credited, corrupting customer lifetime value and the
    // legacy profitability net-revenue subtraction. The refund itself stays
    // a recorded money movement for every refundable status; only the
    // revenue-reversal stats follow revenue truth. For "returned" the
    // transition-refund check below refines this: orders returned through
    // the legacy Return flow already had their stats fully reversed there.
    let totalSpentAdjusted =
      order.status === "delivered" || order.status === "returned";
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

    // Golden COD rules (ARCHITECTURE.md §8.6, 7-b P2): a PARTIAL refund on a
    // delivered order is a money-only movement. Stock is NOT made available
    // before a physical return, and no delivery truth is rewritten. Only the
    // refund that settles the full receivable performs the legacy
    // delivered→returned physical-return transition — and that restoration is
    // variant-aware (see restoreDeliveredStockForFullRefund below).
    const settlesFullReceivable =
      alreadyRefunded + input.amount >= order.totalPrice;
    const performsPhysicalReturn = order.status === "delivered" && settlesFullReceivable;

    const facts: RefundMutationFacts = {
      statusChanged: performsPhysicalReturn,
      stockRestored: performsPhysicalReturn,
      orderCountAdjusted: performsPhysicalReturn,
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

      await restoreDeliveredStockForFullRefund(tx, input.orderId);

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
      await deductRestoredStockOnReversal(tx, refund.orderId);
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
