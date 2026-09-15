/**
 * Meta CAPI outbox effect runtime — durable desktop delivery.
 *
 * FD-061 EX-3 (contracts extracted from CodFlow's CodCapiWorkflow @ 00f18fa,
 * Apache-2.0), re-scoped onto SahelFlow's desktop: the Workflow steps become
 * one bounded drain of due CapiEventLedger claims. The ledger is the durable
 * queue (the dedicated-table precedent of WhatsAppOutboundEffect): the
 * canonical OutboxIntent stays strictly command-kernel-owned, so an
 * autonomous fire-and-forget trigger never mints intents outside a committed
 * BusinessCommand.
 *
 * Drain semantics per due claim (status='claimed', leaseUntil due):
 *   1. Dispatch resolution: disabled/missing config or token → audited skip.
 *   2. Attribution guard: triggeredAt older than 7 days → audited skip.
 *   3. In-flight re-lease (leaseUntil = now + CAPI_LEASE_MS) before the Meta
 *      call, so a crash mid-send cannot re-send before the lease expires —
 *      and Meta's own event_id dedup covers the crash window.
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
  type MetaEventName,
  type ConversionStage,
} from "./capi-conversion";
import {
  getMetaPixelConfig,
  META_CAPI_TOKEN_SECRET_KEY,
} from "./capi-authority";
import { getSecret } from "@/lib/secrets";

export interface DrainCapiOutcome {
  processed: number;
  sent: number;
  failed: number;
  retried: number;
  skipped: number;
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
 * Drain up to `limit` due CAPI ledger claims. One pass per worker tick;
 * failures reschedule themselves onto the ledger (leaseUntil = backoff), so
 * the next tick picks them up without duplicating a send to Meta.
 */
export async function drainDueCapiSends(
  context: ServiceContext,
  limit = 10,
): Promise<DrainCapiOutcome> {
  const outcome: DrainCapiOutcome = { processed: 0, sent: 0, failed: 0, retried: 0, skipped: 0 };
  const now = new Date();

  const dueClaims = await context.prisma.capiEventLedger.findMany({
    where: {
      status: "claimed",
      leaseUntil: { lte: now },
    },
    orderBy: { leaseUntil: "asc" },
    take: limit,
  });
  if (dueClaims.length === 0) return outcome;

  const config = await getMetaPixelConfig(context);
  const accessToken = config
    ? ((await getSecret(context, META_CAPI_TOKEN_SECRET_KEY)) ?? "")
    : "";

  for (const claim of dueClaims) {
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
      claim.eventName as MetaEventName,
      claim.stage as ConversionStage,
    );
    if (!dispatch.send) {
      await context.prisma.capiEventLedger.update({
        where: { id: claim.id },
        data: { status: "skipped", lastError: dispatch.message, sentAt: new Date() },
      });
      await audit(context, {
        orderId: claim.orderId,
        stage: claim.stage,
        eventName: claim.eventName,
        attempt: claim.attempts,
        status: "skipped",
        error: dispatch.message,
      });
      outcome.skipped += 1;
      continue;
    }

    // 7-day Meta hard limit on event_time.
    const triggeredAtSeconds = Math.floor(claim.triggeredAt.getTime() / 1000);
    const ageSeconds = Math.floor(Date.now() / 1000) - triggeredAtSeconds;
    if (ageSeconds >= SEVEN_DAYS_SECONDS) {
      const message = `event_time expired: order ${claim.orderId} is ${Math.round(ageSeconds / 3600)}h old — outside Meta 7-day window`;
      await context.prisma.capiEventLedger.update({
        where: { id: claim.id },
        data: { status: "skipped", lastError: message, sentAt: new Date() },
      });
      await audit(context, {
        orderId: claim.orderId,
        stage: claim.stage,
        eventName: claim.eventName,
        attempt: claim.attempts,
        status: "expired",
        error: message,
      });
      outcome.skipped += 1;
      continue;
    }

    // In-flight re-lease before the network call: a crash mid-send leaves the
    // claim parked for the lease window instead of being re-picked instantly.
    const attempt = claim.attempts + 1;
    await context.prisma.capiEventLedger.update({
      where: { id: claim.id },
      data: { leaseUntil: new Date(Date.now() + CAPI_LEASE_MS) },
    });

    const pixelId = config?.pixelId;
    let result: CapiResult | null = null;
    let sendError: string | null = null;
    try {
      const order = await context.prisma.order.findUnique({
        where: { id: claim.orderId },
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
      if (!order) throw new Error(`Order ${claim.orderId} not found`);
      if (!pixelId) throw new Error("Meta pixel id is not configured");

      const nameParts = order.customer?.name?.trim().split(/\s+/) ?? [];

      result = await sendCapiEvent(pixelId, accessToken, {
        eventName: claim.eventName as MetaEventName,
        eventId: claim.eventId,
        eventTime: triggeredAtSeconds,
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
          claim.eventName === "Purchase"
            ? order.totalPrice + (order.deliveryCost ?? 0)
            : undefined,
        currency: "DZD",
        testEventCode: dispatch.testEventCode,
      });
    } catch (error) {
      sendError = error instanceof Error ? error.message : String(error);
    }

    if (result?.success) {
      await context.prisma.capiEventLedger.update({
        where: { id: claim.id },
        data: {
          status: "sent",
          attempts: attempt,
          metaEventId: result.fbtraceId ?? null,
          lastError: null,
          sentAt: new Date(),
          leaseUntil: null,
        },
      });
      await audit(context, {
        orderId: claim.orderId,
        stage: claim.stage,
        eventName: claim.eventName,
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
      await context.prisma.capiEventLedger.update({
        where: { id: claim.id },
        data: {
          status: "failed",
          attempts: attempt,
          lastError: result.error ?? "Meta rejected the event",
          sentAt: new Date(),
          leaseUntil: null,
        },
      });
      await audit(context, {
        orderId: claim.orderId,
        stage: claim.stage,
        eventName: claim.eventName,
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
    await context.prisma.capiEventLedger.update({
      where: { id: claim.id },
      data: {
        status: terminal ? "failed" : "claimed",
        attempts: attempt,
        lastError: sendError,
        leaseUntil: terminal ? null : new Date(Date.now() + Math.min(delayMs, CAPI_LEASE_MS * 6)),
        sentAt: terminal ? new Date() : null,
      },
    });
    await audit(context, {
      orderId: claim.orderId,
      stage: claim.stage,
      eventName: claim.eventName,
      attempt,
      status: terminal ? "failed" : "claimed",
      error: sendError,
    });
    if (terminal) outcome.failed += 1;
    else outcome.retried += 1;
  }

  return outcome;
}
