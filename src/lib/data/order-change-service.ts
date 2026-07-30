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
import { getBusinessEnvelopeKey } from "@/lib/business-truth/envelope-key";
import { openBusinessPayloadWithKey } from "@/lib/business-truth/payload-codec";

export type OrderChangeTransactionClient = Parameters<
  Parameters<DbClient["$transaction"]>[0]
>[0];

export interface OrderChangeEntry {
  orderId: string;
  actionType: string;
  actor?: string;
  payload?: Record<string, unknown>;
  status?: string;
}

export interface RefundMutationFacts {
  statusChanged: boolean;
  stockRestored: boolean;
  orderCountAdjusted: boolean;
  totalSpentAdjusted: boolean;
}

function orderChangeData(entry: OrderChangeEntry) {
  return {
    orderId: entry.orderId,
    actionType: entry.actionType,
    actor: entry.actor ?? "user",
    status: entry.status ?? "confirmed",
    payload: entry.payload ? JSON.stringify(redactPii(entry.payload)) : null,
  };
}

/**
 * Strict ledger write for a caller-owned Prisma transaction. There is no
 * fallback client and no catch: a failed ledger write aborts the transaction.
 */
export async function recordOrderChangeInTx(
  tx: OrderChangeTransactionClient,
  entry: OrderChangeEntry,
): Promise<void> {
  await tx.orderChange.create({ data: orderChangeData(entry) });
}

/** Get the full timeline for an order (newest first). */
export async function getOrderTimeline(
  context: ServiceContext,
  orderId: string,
  limit = 50,
) {
  try {
    const entries = await context.prisma.orderChange.findMany({
      where: { orderId },
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(limit, 1), 200),
    });
    const hasSealedReason = entries.some((entry) =>
      entry.payload?.includes('"rejectionReasonEnvelope"'),
    );
    if (!hasSealedReason) return entries;

    let envelopeKey: Buffer | null = null;
    try {
      envelopeKey = await getBusinessEnvelopeKey(context);
    } catch {
      // The timeline remains available without exposing a sealed value.
    }

    return entries.map((entry) => ({
      ...entry,
      payload: materializeRejectionReason(entry.payload, envelopeKey),
    }));
  } catch {
    return [];
  }
}

function materializeRejectionReason(
  payloadJson: string | null,
  envelopeKey: Buffer | null,
): string | null {
  if (!payloadJson) return payloadJson;
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(payloadJson) as Record<string, unknown>;
  } catch {
    return payloadJson;
  }
  const sealed = payload.rejectionReasonEnvelope;
  const commandId = payload.commandId;
  if (typeof sealed !== "string" || typeof commandId !== "string") {
    return payloadJson;
  }
  const visible = { ...payload };
  delete visible.rejectionReasonEnvelope;
  if (!envelopeKey) {
    return JSON.stringify({
      ...visible,
      rejectionReasonUnavailable: true,
    });
  }
  try {
    const opened = openBusinessPayloadWithKey<{ rejectionReason: string }>(
      sealed,
      {
        kind: "order-change-detail",
        recordKey: `${commandId}:rejection-reason`,
        recordType: "order.rejection-reason.v1",
        commandId,
      },
      envelopeKey,
    );
    return JSON.stringify({
      ...visible,
      rejectionReason: opened.rejectionReason,
    });
  } catch {
    return JSON.stringify({
      ...visible,
      rejectionReasonUnavailable: true,
    });
  }
}

/** Record a status transition in the caller's transaction. */
export async function recordStatusChangeInTx(
  tx: OrderChangeTransactionClient,
  orderId: string,
  from: string,
  to: string,
  actor = "user",
): Promise<void> {
  await recordOrderChangeInTx(tx, {
    orderId,
    actionType: "status_change",
    actor,
    payload: { from, to },
  });
}

/** Record a refund in the caller's transaction. */
export async function recordRefundInTx(
  tx: OrderChangeTransactionClient,
  orderId: string,
  refundId: string,
  amount: number,
  method: string,
  actor = "user",
  facts?: RefundMutationFacts,
): Promise<void> {
  await recordOrderChangeInTx(tx, {
    orderId,
    actionType: "refund",
    actor,
    payload: { refundId, amount, method, ...facts },
  });
}
