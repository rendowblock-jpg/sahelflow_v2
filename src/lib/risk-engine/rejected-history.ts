import "server-only";

import type { ServiceContext } from "@/lib/data/service-base";
import { getBusinessEnvelopeKey } from "@/lib/business-truth/envelope-key";
import { openBusinessPayloadWithKey } from "@/lib/business-truth/payload-codec";

const FAKE_ORDER_REASON_KEY = "fakeOrder";

function extractRejectionReason(
  payloadJson: string | null,
  envelopeKey: Buffer | null,
): string | null {
  if (!payloadJson) return null;
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(payloadJson) as Record<string, unknown>;
  } catch {
    return null;
  }

  if (typeof payload.rejectionReason === "string") {
    return payload.rejectionReason;
  }

  const sealed = payload.rejectionReasonEnvelope;
  const commandId = payload.commandId;
  if (typeof sealed !== "string" || typeof commandId !== "string" || !envelopeKey) {
    return null;
  }

  try {
    const opened = openBusinessPayloadWithKey<{ rejectionReason?: unknown }>(
      sealed,
      {
        kind: "order-change-detail",
        recordKey: `${commandId}:rejection-reason`,
        recordType: "order.rejection-reason.v1",
        commandId,
      },
      envelopeKey,
    );
    return typeof opened.rejectionReason === "string" ? opened.rejectionReason : null;
  } catch {
    return null;
  }
}

/**
 * Return the subset of cancelled order IDs that were rejected with the
 * locale-stable fakeOrder rejection reason (Item 2 fake-order gate, M3).
 *
 * Executes zero DB queries when cancelledOrderIds is empty and at most one
 * batched orderChange.findMany otherwise. Scoped to context.prisma and that
 * shop envelope key so another seller data can never leak.
 */
export async function findFakeRejectedOrderIds(
  context: ServiceContext,
  cancelledOrderIds: readonly string[],
): Promise<ReadonlySet<string>> {
  const uniqueIds = [...new Set(cancelledOrderIds)];
  if (uniqueIds.length === 0) return new Set();

  const entries = await context.prisma.orderChange.findMany({
    where: {
      orderId: { in: uniqueIds },
      status: "cancelled",
    },
    select: {
      orderId: true,
      payload: true,
    },
  });

  if (entries.length === 0) return new Set();

  const hasSealed = entries.some((entry) =>
    entry.payload?.includes('"rejectionReasonEnvelope"'),
  );
  let envelopeKey: Buffer | null = null;
  if (hasSealed) {
    try {
      envelopeKey = await getBusinessEnvelopeKey(context);
    } catch {
      envelopeKey = null;
    }
  }

  const fakeOrderIds = new Set<string>();
  for (const entry of entries) {
    if (extractRejectionReason(entry.payload, envelopeKey) === FAKE_ORDER_REASON_KEY) {
      fakeOrderIds.add(entry.orderId);
    }
  }
  return fakeOrderIds;
}
