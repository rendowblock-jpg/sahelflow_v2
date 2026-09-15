/**
 * Meta CAPI outbox effect runtime — durable desktop delivery.
 *
 * FD-061 EX-3 (contracts extracted from CodFlow's CodCapiWorkflow @ 00f18fa,
 * Apache-2.0), re-scoped onto SahelFlow's desktop outbox: the Workflow steps
 * become one bounded drain of due OutboxIntents with the same claim-lease,
 * 7-day attribution guard, 5×30 s exponential retry matrix and terminal-failure
 * recording. Triggers ride the desktop outbox — never a Worker.
 *
 * Drain semantics per due intent:
 *   1. Load the ledger claim row; skip when it was already resolved.
 *   2. Load fresh order + pixel config + token (never trust stale payloads).
 *   3. Attribution guard: triggeredAt older than 7 days → audited skip.
 *   4. Send via capi-client. Network/5xx throws → retryable: attempts + 1,
 *      leaseUntil = now + 30 s × 2^(attempt-1); the 5th failure is terminal.
 *   5. 4xx / malformed → terminal failed record. Success → sent + fbtrace_id.
 * Every outcome writes a fire-and-forget CapiAttemptLog row.
 */
import "server-only";

import { randomUUID } from "node:crypto";

import type { ServiceContext } from "@/lib/data/service-base";
import {
  sendCapiEvent,
  type CapiResult,
} from "./capi-client";
import {
  resolveCapiDispatch,
  SEVEN_DAYS_SECONDS,
  CAPI_MAX_ATTEMPTS,
  capiRetryDelayMs,
  CAPI_LEASE_MS,
  type ConversionStage,
  type MetaEventName,
} from "./capi-conversion";
import {
  getMetaPixelConfig,
  META_CAPI_TOKEN_SECRET_KEY,
  META_CAPI_EFFECT_TYPE,
} from "./capi-authority";
import { getSecret } from "@/lib/secrets";

export interface DrainCapiOutcome {
  processed: number;
  sent: number;
  failed: number;
  retried: number;
  skipped: number;
}

interface CapiIntentPayload {
  orderId: string;
  stage: ConversionStage;
  eventName: MetaEventName;
  triggeredAt: number; // unix seconds
  triggerStatus: string;
}

function parsePayload(raw: string): CapiIntentPayload | null {
  try {
    const parsed = JSON.parse(raw) as Partial<CapiIntentPayload>;
    if (
      typeof parsed.orderId !== "string" ||
      (parsed.stage !== "checkout" && parsed.stage !== "confirmed" && parsed.stage !== "delivered") ||
      (parsed.eventName !== "Lead" && parsed.eventName !== "Purchase") ||
      typeof parsed.triggeredAt !== "number"
    ) {
      return null;
    }
    return parsed as CapiIntentPayload;
  } catch {
    return null;
  }
}

async function audit(
  context: ServiceContext,
  entry: {
    orderId: string;
    stage: string;
    eventName: string;
    attempt: number;
    status: string;
    httpStatus?: number | null;
    fbtraceId?: string | null;
    error?: string | null;
  },
): Promise<void> {
  try {
    await context.prisma.capiAttemptLog.create({
      data: {
        id: randomUUID(),
        orderId: entry.orderId,
        stage: entry.stage,
        eventName: entry.eventName,
        attempt: entry.attempt,
        status: entry.status,
        httpStatus: entry.httpStatus ?? null,
        fbtraceId: entry.fbtraceId ?? null,
        error: entry.error ?? null,
      },
    });
  } catch {
    // Fire-and-forget by design — an audit write failure never propagates.
  }
}

/**
 * Drain up to `limit` due CAPI intents. One lease per drain pass; failures
 * reschedule themselves onto the ledger (leaseUntil = backoff), so the next
 * tick picks them up without duplicating a send to Meta.
 */
export async function drainDueCapiSends(
  context: ServiceContext,
  limit = 10,
): Promise<DrainCapiOutcome> {
  const outcome: DrainCapiOutcome = { processed: 0, sent: 0, failed: 0, retried: 0, skipped: 0 };
  const now = new Date();

  const dueIntents = await context.prisma.outboxIntent.findMany({
    where: {
      effectType: META_CAPI_EFFECT_TYPE,
      status: "queued",
      nextAttemptAt: { lte: now },
    },
    orderBy: { nextAttemptAt: "asc" },
    take: limit,
  });
  if (dueIntents.length === 0) return outcome;

  const config = await getMetaPixelConfig(context);
  const accessToken = config
    ? ((await getSecret(context, META_CAPI_TOKEN_SECRET_KEY)) ?? "")
    : "";

  for (const intent of dueIntents) {
    const payload = parsePayload(intent.payloadJson);
    if (!payload) {
      await context.prisma.outboxIntent.update({
        where: { id: intent.id },
        data: {
          status: "dead_letter",
          lastErrorCode: "MALFORMED_PAYLOAD",
          outcomeState: "failed",
        },
      });
      outcome.failed += 1;
      continue;
    }

    const ledger = await context.prisma.capiEventLedger.findUnique({
      where: {
        orderId_stage_eventName: {
          orderId: payload.orderId,
          stage: payload.stage,
          eventName: payload.eventName,
        },
      },
    });
    if (!ledger || ledger.status === "sent") {
      await context.prisma.outboxIntent.update({
        where: { id: intent.id },
        data: { status: "done", outcomeState: ledger ? "sent" : "abandoned" },
      });
      outcome.skipped += 1;
      continue;
    }

    const dispatch = resolveCapiDispatch(
      config
        ? {
            enabled: config.enabled,
            accessToken,
            conversionEvent: config.conversionEvent,
            testMode: config.testMode,
            testEventCode: config.testEventCode,
          }
        : null,
      payload.eventName,
      payload.stage,
    );
    if (!dispatch.send) {
      await context.prisma.$transaction([
        context.prisma.capiEventLedger.update({
          where: { id: ledger.id },
          data: { status: "skipped", lastError: dispatch.message, sentAt: new Date() },
        }),
        context.prisma.outboxIntent.update({
          where: { id: intent.id },
          data: { status: "done", outcomeState: "skipped" },
        }),
      ]);
      await audit(context, {
        orderId: payload.orderId,
        stage: payload.stage,
        eventName: payload.eventName,
        attempt: ledger.attempts,
        status: "skipped",
        error: dispatch.message,
      });
      outcome.skipped += 1;
      continue;
    }

    // 7-day Meta hard limit on event_time.
    const ageSeconds = Math.floor(Date.now() / 1000) - payload.triggeredAt;
    if (ageSeconds >= SEVEN_DAYS_SECONDS) {
      const message = `event_time expired: order ${payload.orderId} is ${Math.round(ageSeconds / 3600)}h old — outside Meta 7-day window`;
      await context.prisma.$transaction([
        context.prisma.capiEventLedger.update({
          where: { id: ledger.id },
          data: { status: "skipped", lastError: message, sentAt: new Date() },
        }),
        context.prisma.outboxIntent.update({
          where: { id: intent.id },
          data: { status: "done", outcomeState: "skipped" },
        }),
      ]);
      await audit(context, {
        orderId: payload.orderId,
        stage: payload.stage,
        eventName: payload.eventName,
        attempt: ledger.attempts,
        status: "expired",
        error: message,
      });
      outcome.skipped += 1;
      continue;
    }

    const attempt = ledger.attempts + 1;
    const pixelId = config?.pixelId;
    let result: CapiResult | null = null;
    let sendError: string | null = null;
    try {
      const order = await context.prisma.order.findUnique({
        where: { id: payload.orderId },
        select: {
          id: true,
          customerId: true,
          phone: true,
          commune: true,
          totalPrice: true,
          deliveryCost: true,
          fbc: true,
          fbp: true,
          clientIp: true,
          userAgent: true,
          customer: { select: { name: true } },
        },
      });
      if (!order) throw new Error(`Order ${payload.orderId} not found`);
      if (!pixelId) throw new Error("Meta pixel id is not configured");

      const nameParts = order.customer?.name?.trim().split(/\s+/) ?? [];

      result = await sendCapiEvent(pixelId, accessToken, {
        eventName: payload.eventName,
        eventId: payload.orderId,
        eventTime: payload.triggeredAt,
        userData: {
          phone: order.phone,
          firstName: nameParts[0] || undefined,
          lastName: nameParts.length > 1 ? nameParts[nameParts.length - 1] : undefined,
          externalId: order.customerId,
          city: order.commune,
          fbc: order.fbc,
          fbp: order.fbp,
          clientIpAddress: order.clientIp,
          clientUserAgent: order.userAgent,
        },
        value:
          payload.eventName === "Purchase"
            ? order.totalPrice + (order.deliveryCost ?? 0)
            : undefined,
        currency: "DZD",
        testEventCode: dispatch.testEventCode,
      });
    } catch (error) {
      sendError = error instanceof Error ? error.message : String(error);
    }

    await context.prisma.capiEventLedger.update({
      where: { id: ledger.id },
      data: { attempts: attempt },
    });

    if (result?.success) {
      await context.prisma.$transaction([
        context.prisma.capiEventLedger.update({
          where: { id: ledger.id },
          data: {
            status: "sent",
            metaEventId: result.fbtraceId ?? null,
            lastError: null,
            sentAt: new Date(),
            leaseUntil: null,
          },
        }),
        context.prisma.outboxIntent.update({
          where: { id: intent.id },
          data: {
            status: "done",
            outcomeState: "sent",
            receiptJson: JSON.stringify({ fbtraceId: result.fbtraceId ?? null }),
            succeededAt: new Date(),
          },
        }),
      ]);
      await audit(context, {
        orderId: payload.orderId,
        stage: payload.stage,
        eventName: payload.eventName,
        attempt,
        status: "sent",
        httpStatus: result.httpStatus,
        fbtraceId: result.fbtraceId,
      });
      outcome.sent += 1;
      continue;
    }

    if (result) {
      // 4xx: Meta rejected the batch — terminal failure, never retried.
      await context.prisma.$transaction([
        context.prisma.capiEventLedger.update({
          where: { id: ledger.id },
          data: {
            status: "failed",
            lastError: result.error ?? "Meta rejected the event",
            sentAt: new Date(),
            leaseUntil: null,
          },
        }),
        context.prisma.outboxIntent.update({
          where: { id: intent.id },
          data: { status: "done", outcomeState: "failed", lastErrorCode: "META_REJECTED" },
        }),
      ]);
      await audit(context, {
        orderId: payload.orderId,
        stage: payload.stage,
        eventName: payload.eventName,
        attempt,
        status: "failed",
        httpStatus: result.httpStatus,
        error: result.error,
      });
      outcome.failed += 1;
      continue;
    }

    // Retryable failure (network / 5xx): attempts + backoff, terminal at 5.
    const terminal = attempt >= CAPI_MAX_ATTEMPTS;
    const delayMs = capiRetryDelayMs(attempt);
    await context.prisma.$transaction([
      context.prisma.capiEventLedger.update({
        where: { id: ledger.id },
        data: {
          status: terminal ? "failed" : "claimed",
          lastError: sendError,
          attempts: attempt,
          leaseUntil: terminal ? null : new Date(Date.now() + Math.min(delayMs, CAPI_LEASE_MS * 6)),
          sentAt: terminal ? new Date() : null,
        },
      }),
      context.prisma.outboxIntent.update({
        where: { id: intent.id },
        data: terminal
          ? { status: "dead_letter", outcomeState: "failed", lastErrorCode: "CAPI_SEND_EXHAUSTED" }
          : { status: "queued", nextAttemptAt: new Date(Date.now() + delayMs) },
      }),
    ]);
    await audit(context, {
      orderId: payload.orderId,
      stage: payload.stage,
      eventName: payload.eventName,
      attempt,
      status: terminal ? "failed" : "claimed",
      error: sendError,
    });
    if (terminal) outcome.failed += 1;
    else outcome.retried += 1;
  }

  return outcome;
}
