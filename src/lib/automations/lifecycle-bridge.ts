import "server-only";

import { randomUUID } from "node:crypto";

import { getBusinessEnvelopeKey } from "@/lib/business-truth/envelope-key";
import { openBusinessPayloadWithKey } from "@/lib/business-truth/payload-codec";
import type { ServiceContext } from "@/lib/data/service-base";
import { enqueueAutomationTrigger } from "./trigger-service";
import {
  type AutomationTrigger,
  type AutomationTriggerPayload,
} from "./contracts";

/**
 * Canonical automation bridge (7-b P1).
 *
 * Governed order commands commit their lifecycle truth as encrypted
 * `OutboxIntent` markers inside the same transaction that mutates the Order
 * aggregate (fulfillment ship/deliver, courier tracking ingest, canonical
 * recovery, customer returns). This module is the SINGLE authority that maps
 * those durable kernel events onto `automation.trigger.v1` intents, so seller
 * automations for the flagship COD moments fire from the exact events the
 * business-truth kernel emits — never from ad-hoc `dispatchTrigger` strings at
 * call sites.
 *
 * Effect types that are not listed stay untouched audit markers (pruned by the
 * outbox retention sweeper) and never block this drain.
 */

const BRIDGE_LEASE_MS = 90_000;
const BRIDGE_MAX_ATTEMPTS = 6;
const BRIDGE_RETRY_DELAYS_MS = [
  5_000,
  30_000,
  120_000,
  600_000,
  1_800_000,
] as const;
const MAX_BRIDGE_RETRY_DELAY_MS = 1_800_000;

interface LifecycleBridgeMapping {
  trigger: AutomationTrigger;
  /**
   * When set, the trigger only fires if the lifecycle marker's recorded order
   * status matches (e.g. a partial customer-return completion keeps the order
   * in `delivered` and must not claim the `order.returned` moment).
   */
  requireStatus?: "returned";
}

export const LIFECYCLE_AUTOMATION_BRIDGE: Readonly<
  Record<string, LifecycleBridgeMapping>
> = {
  // Manual canonical fulfillment (canonical-fulfillment.ts) and the courier
  // tracking ingest, which emits the same marker effect types.
  "order.fulfillment.shipped.v1": { trigger: "order.shipped" },
  "order.delivery.delivered.v1": { trigger: "order.delivered" },
  // Canonical recovery (canonical-order-recovery.ts).
  "order.recovery.cancel.v1": { trigger: "order.cancelled" },
  "order.recovery.delivery_refused.v1": { trigger: "order.refused" },
  "order.recovery.inspect_return.v1": { trigger: "order.returned" },
  // Customer return machine (canonical-customer-return.ts) — a full-order
  // completion flips the order to `returned`; partial completions stay
  // `delivered` and are skipped by the status guard.
  "customer-return.complete.v1": {
    trigger: "order.returned",
    requireStatus: "returned",
  },
};

export const LIFECYCLE_BRIDGE_EFFECT_TYPES = Object.keys(
  LIFECYCLE_AUTOMATION_BRIDGE,
);

interface BridgeIntentRow {
  id: string;
  effectKey: string;
  commandId: string;
  effectType: string;
  payloadJson: string;
  status: string;
  attemptCount: number;
  nextAttemptAt: Date | null;
  lockedAt: Date | null;
  leaseToken: string | null;
  lastErrorCode: string | null;
  createdAt: Date;
}

interface ClaimedBridge extends BridgeIntentRow {
  activeLeaseToken: string;
}

export interface LifecycleBridgeDrainResult {
  effectKey: string;
  effectType: string;
  state: "succeeded" | "retrying" | "dead_letter";
  trigger: AutomationTrigger | null;
  skipped: boolean;
  errorCode: string | null;
}

function retryDelay(attemptCount: number): number {
  return (
    BRIDGE_RETRY_DELAYS_MS[
      Math.min(
        Math.max(attemptCount - 1, 0),
        BRIDGE_RETRY_DELAYS_MS.length - 1,
      )
    ] ?? MAX_BRIDGE_RETRY_DELAY_MS
  );
}

async function claimLifecycleMarker(
  context: ServiceContext,
): Promise<ClaimedBridge | null> {
  return context.prisma.$transaction(async (tx) => {
    const now = new Date();
    const expiredBefore = new Date(now.getTime() - BRIDGE_LEASE_MS);
    const current = await tx.outboxIntent.findFirst({
      where: {
        effectType: { in: [...LIFECYCLE_BRIDGE_EFFECT_TYPES] },
        OR: [
          { status: "queued" },
          {
            status: "retrying",
            OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
          },
          { status: "processing", lockedAt: { lte: expiredBefore } },
        ],
      },
      orderBy: { createdAt: "asc" },
    });
    if (!current) return null;
    const row = current as BridgeIntentRow;

    if (row.attemptCount >= BRIDGE_MAX_ATTEMPTS) {
      await tx.outboxIntent.updateMany({
        where: {
          id: row.id,
          status: row.status,
          attemptCount: row.attemptCount,
        },
        data: {
          status: "dead_letter",
          lastErrorCode:
            row.lastErrorCode ?? "LIFECYCLE_BRIDGE_ATTEMPTS_EXHAUSTED",
          nextAttemptAt: null,
          lockedAt: null,
          leaseToken: null,
          deadLetteredAt: now,
        },
      });
      return null;
    }

    const activeLeaseToken = randomUUID();
    const claimed = await tx.outboxIntent.updateMany({
      where: {
        id: row.id,
        status: row.status,
        attemptCount: row.attemptCount,
      },
      data: {
        status: "processing",
        attemptCount: { increment: 1 },
        nextAttemptAt: null,
        lockedAt: now,
        leaseToken: activeLeaseToken,
        lastErrorCode: null,
      },
    });
    if (claimed.count !== 1) return null;
    return {
      ...row,
      status: "processing",
      attemptCount: row.attemptCount + 1,
      nextAttemptAt: null,
      lockedAt: now,
      leaseToken: activeLeaseToken,
      lastErrorCode: null,
      activeLeaseToken,
    };
  });
}

async function openLifecycleMarkerPayload(
  context: ServiceContext,
  claim: ClaimedBridge,
): Promise<Record<string, unknown>> {
  const envelopeKey = await getBusinessEnvelopeKey(context);
  const raw = openBusinessPayloadWithKey<unknown>(
    claim.payloadJson,
    {
      kind: "outbox-intent",
      recordKey: claim.effectKey,
      recordType: claim.effectType,
      commandId: claim.commandId,
    },
    envelopeKey,
  );
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Lifecycle marker payload is not a record");
  }
  return raw as Record<string, unknown>;
}

interface BridgeOrderRow {
  id: string;
  orderNumber: string;
  customerId: string;
  phone: string | null;
  totalPrice: number;
  wilaya: string;
}

async function buildBridgeTriggerPayload(
  context: ServiceContext,
  markerPayload: Record<string, unknown>,
): Promise<AutomationTriggerPayload> {
  const orderId = markerPayload.orderId;
  if (typeof orderId !== "string" || orderId.length === 0) {
    throw new Error("Lifecycle marker payload has no orderId authority");
  }
  const order = (await context.prisma.order.findFirst({
    where: { id: orderId, deletedAt: null },
    select: {
      id: true,
      orderNumber: true,
      customerId: true,
      phone: true,
      totalPrice: true,
      wilaya: true,
    },
  })) as BridgeOrderRow | null;
  if (!order) {
    throw new Error(
      `Lifecycle bridge order authority is missing: ${orderId}`,
    );
  }
  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    customerId: order.customerId,
    customerPhone: order.phone ?? undefined,
    totalPrice: order.totalPrice,
    wilaya: order.wilaya,
  };
}

async function markBridgeSettled(
  context: ServiceContext,
  claim: ClaimedBridge,
  receipt: { trigger: AutomationTrigger; triggerKey: string; skipped?: boolean },
): Promise<LifecycleBridgeDrainResult> {
  const updated = await context.prisma.outboxIntent.updateMany({
    where: {
      id: claim.id,
      status: "processing",
      leaseToken: claim.activeLeaseToken,
    },
    data: {
      status: "succeeded",
      outcomeState: "receipt",
      receiptJson: JSON.stringify(receipt),
      succeededAt: new Date(),
      nextAttemptAt: null,
      lockedAt: null,
      leaseToken: null,
      lastErrorCode: null,
    },
  });
  if (updated.count !== 1) {
    throw new Error(
      "Lifecycle bridge lease changed before receipt commit",
    );
  }
  return {
    effectKey: claim.effectKey,
    effectType: claim.effectType,
    state: "succeeded",
    trigger: receipt.trigger,
    skipped: receipt.skipped === true,
    errorCode: null,
  };
}

async function markBridgeFailure(
  context: ServiceContext,
  claim: ClaimedBridge,
  error: unknown,
  trigger: AutomationTrigger | null,
): Promise<LifecycleBridgeDrainResult> {
  const code =
    error instanceof Error && error.name
      ? error.name.slice(0, 128)
      : "LIFECYCLE_BRIDGE_FAILED";
  const exhausted = claim.attemptCount >= BRIDGE_MAX_ATTEMPTS;
  const state = exhausted ? "dead_letter" : "retrying";
  const nextAttemptAt = exhausted
    ? null
    : new Date(Date.now() + retryDelay(claim.attemptCount));
  await context.prisma.outboxIntent.updateMany({
    where: {
      id: claim.id,
      status: "processing",
      leaseToken: claim.activeLeaseToken,
    },
    data: {
      status: state,
      outcomeState: "none",
      lastErrorCode: code,
      nextAttemptAt,
      lockedAt: null,
      leaseToken: null,
      deadLetteredAt: exhausted ? new Date() : null,
    },
  });
  return {
    effectKey: claim.effectKey,
    effectType: claim.effectType,
    state,
    trigger,
    skipped: false,
    errorCode: code,
  };
}

async function executeBridgeClaim(
  context: ServiceContext,
  claim: ClaimedBridge,
): Promise<LifecycleBridgeDrainResult> {
  const mapping = LIFECYCLE_AUTOMATION_BRIDGE[claim.effectType];
  if (!mapping) {
    // Defensive: the claim filter only selects mapped types, but a concurrent
    // registry change must never wedge a claimed row in `processing`.
    return markBridgeFailure(
      context,
      claim,
      new Error("LIFECYCLE_BRIDGE_MAPPING_MISSING"),
      null,
    );
  }
  try {
    const markerPayload = await openLifecycleMarkerPayload(context, claim);
    if (mapping.requireStatus && markerPayload.status !== mapping.requireStatus) {
      // Not the seller-facing moment this trigger describes (partial customer
      // return completion keeps the order `delivered`). Record the skip as a
      // succeeded receipt so the marker is never reprocessed.
      return await markBridgeSettled(context, claim, {
        trigger: mapping.trigger,
        triggerKey: `lifecycle-skipped:${claim.effectKey}`,
        skipped: true,
      });
    }
    const payload = await buildBridgeTriggerPayload(context, markerPayload);
    await enqueueAutomationTrigger(context, mapping.trigger, payload, {
      triggerKey: `lifecycle:${claim.effectKey}`,
      occurredAt: claim.createdAt,
    });
    return await markBridgeSettled(context, claim, {
      trigger: mapping.trigger,
      triggerKey: `lifecycle:${claim.effectKey}`,
    });
  } catch (error) {
    return markBridgeFailure(context, claim, error, mapping.trigger);
  }
}

/**
 * Drain lifecycle outbox markers into durable automation trigger intents.
 * Mirrors the trigger processor's bounded claim loop: one lease per marker,
 * retry with backoff, dead-letter after the attempt cap. Enqueueing is
 * idempotent per marker (deterministic trigger key), so a crash between
 * enqueue and receipt replays safely.
 */
export async function drainDueLifecycleTriggerBridges(
  context: ServiceContext,
  limit = 10,
): Promise<LifecycleBridgeDrainResult[]> {
  const bounded = Math.max(1, Math.min(limit, 25));
  const results: LifecycleBridgeDrainResult[] = [];
  for (let index = 0; index < bounded; index += 1) {
    const claimed = await claimLifecycleMarker(context);
    if (!claimed) break;
    results.push(await executeBridgeClaim(context, claimed));
  }
  return results;
}
