import "server-only";

import type { ServiceContext } from "@/lib/data/service-base";
import { redactPii } from "@/lib/redact-pii";
import { ConflictError, SahelFlowError } from "@/types/errors";
import {
  processWhatsAppInbound,
  type WhatsAppIngressProcessingResult,
} from "./inbound-processor";

const ACTIVE_LEASE_MS = 90_000;

export interface RetryWhatsAppInboundInput {
  ingressEventId: string;
  auditActor: string;
  reason: string;
}

export async function retryWhatsAppInbound(
  context: ServiceContext,
  input: RetryWhatsAppInboundInput,
): Promise<WhatsAppIngressProcessingResult> {
  const reason = input.reason.trim();
  if (reason.length < 3 || reason.length > 500) {
    throw new SahelFlowError(
      "WhatsApp ingress retry reason must contain 3 to 500 characters",
      "VALIDATION_ERROR",
      400,
    );
  }

  await context.prisma.$transaction(async (tx) => {
    const event = await tx.providerIngressEvent.findUnique({
      where: { id: input.ingressEventId },
      select: {
        id: true,
        status: true,
        attemptCount: true,
        operatorRetryCount: true,
        lockedAt: true,
        leaseToken: true,
        conversationId: true,
        messageId: true,
        lastErrorCode: true,
      },
    });
    if (!event) {
      throw new SahelFlowError(
        "WhatsApp ingress event not found",
        "NOT_FOUND",
        404,
      );
    }
    if (event.status === "applied" || event.messageId || event.conversationId) {
      throw new ConflictError(
        "An applied WhatsApp ingress event cannot be replayed",
      );
    }
    if (
      event.status === "processing" &&
      event.lockedAt &&
      event.lockedAt.getTime() > Date.now() - ACTIVE_LEASE_MS
    ) {
      throw new ConflictError(
        "WhatsApp ingress event is still owned by an active processing lease",
      );
    }

    const now = new Date();
    if (event.status === "processing" && event.leaseToken) {
      await tx.providerIngressAttempt.updateMany({
        where: {
          ingressEventId: event.id,
          leaseToken: event.leaseToken,
          state: "processing",
        },
        data: {
          state: "lease_expired",
          errorCode: "LEASE_EXPIRED",
          detailJson: JSON.stringify({
            retryable: true,
            category: "operator-recovered-expired-lease",
          }),
          completedAt: now,
        },
      });
    }

    const nextOperatorRetryCount = event.operatorRetryCount + 1;
    await tx.providerIngressEvent.update({
      where: { id: event.id },
      data: {
        status: "received",
        // Attempt numbers remain cumulative and immutable. This counter grants
        // one additional bounded six-attempt budget for the audited recovery.
        operatorRetryCount: nextOperatorRetryCount,
        nextAttemptAt: null,
        lockedAt: null,
        leaseToken: null,
        lastErrorCode: null,
        quarantinedAt: null,
        deadLetteredAt: null,
      },
    });
    await tx.auditLog.create({
      data: {
        action: "whatsapp.ingress.retry_requested",
        entity: "provider-ingress-event",
        entityId: event.id,
        actor: input.auditActor,
        before: JSON.stringify({
          status: event.status,
          attemptCount: event.attemptCount,
          operatorRetryCount: event.operatorRetryCount,
          lastErrorCode: event.lastErrorCode,
        }),
        after: JSON.stringify({
          status: "received",
          attemptCount: event.attemptCount,
          operatorRetryCount: nextOperatorRetryCount,
        }),
        metadata: JSON.stringify(redactPii({ reason })),
      },
    });
  });

  return processWhatsAppInbound(context, input.ingressEventId);
}
