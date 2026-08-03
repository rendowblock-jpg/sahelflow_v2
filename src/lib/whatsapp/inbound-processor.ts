import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";

import { executeBusinessCommand } from "@/lib/business-truth/command-kernel";
import { getBusinessEnvelopeKey } from "@/lib/business-truth/envelope-key";
import { providerBusinessPrincipal } from "@/lib/business-truth/principal";
import { openBusinessCommandResultWithKey } from "@/lib/business-truth/result-codec";
import type { ServiceContext } from "@/lib/data/service-base";
import { ConflictError, SahelFlowError } from "@/types/errors";
import {
  whatsappInboundEnvelopeSchema,
  type WhatsAppInboundEnvelope,
} from "./inbound-ingress";
import { messageText } from "./types";

export const AUTOMATION_TRIGGER_EFFECT_TYPE = "automation.trigger.v1";
const WHATSAPP_INGRESS_COMMAND_TYPE = "whatsapp_message.receive.v1";
const MAX_ATTEMPTS_PER_BUDGET = 6;
const LEASE_MS = 90_000;
const RETRY_DELAYS_MS = [5_000, 30_000, 120_000, 600_000, 1_800_000] as const;
const MAX_RETRY_DELAY_MS = 1_800_000;

export type WhatsAppIngressProcessingState =
  | "received"
  | "processing"
  | "retrying"
  | "applied"
  | "quarantined"
  | "dead_letter";

export interface WhatsAppIngressProcessingResult {
  ingressEventId: string;
  state: WhatsAppIngressProcessingState;
  conversationId: string | null;
  messageId: string | null;
  publish: boolean;
  errorCode: string | null;
}

interface IngressRow {
  id: string;
  ingressKey: string;
  payloadJson: string;
  payloadHash: string;
  status: string;
  attemptCount: number;
  operatorRetryCount: number;
  nextAttemptAt: Date | null;
  lockedAt: Date | null;
  leaseToken: string | null;
  providerTimestamp: Date | null;
  conversationId: string | null;
  messageId: string | null;
  lastErrorCode: string | null;
}

interface ClaimedIngress extends IngressRow {
  attemptNumber: number;
  attemptId: string;
  activeLeaseToken: string;
}

function publicResult(row: IngressRow): WhatsAppIngressProcessingResult {
  const state = row.status as WhatsAppIngressProcessingState;
  return {
    ingressEventId: row.id,
    state,
    conversationId: row.conversationId,
    messageId: row.messageId,
    publish: state === "applied",
    errorCode: row.lastErrorCode,
  };
}

function attemptBudget(operatorRetryCount: number): number {
  return MAX_ATTEMPTS_PER_BUDGET * (operatorRetryCount + 1);
}

function attemptWithinCurrentBudget(
  attemptNumber: number,
  operatorRetryCount: number,
): number {
  return Math.max(
    1,
    attemptNumber - operatorRetryCount * MAX_ATTEMPTS_PER_BUDGET,
  );
}

function retryDelay(attemptNumber: number): number {
  return (
    RETRY_DELAYS_MS[
      Math.min(attemptNumber - 1, RETRY_DELAYS_MS.length - 1)
    ] ?? MAX_RETRY_DELAY_MS
  );
}

function messageType(input: WhatsAppInboundEnvelope): string {
  const payload = input.message.message as Record<string, unknown>;
  if (payload.conversation || payload.extendedTextMessage) return "text";
  if (payload.imageMessage) return "image";
  if (payload.videoMessage) return "video";
  if (payload.audioMessage) return "audio";
  if (payload.documentMessage) return "document";
  if (payload.stickerMessage) return "sticker";
  if (payload.locationMessage || payload.liveLocationMessage) return "location";
  if (payload.contactMessage || payload.contactsArrayMessage) return "contact";
  return "unknown";
}

function jidPhone(sourceId: string): string | null {
  if (!sourceId.endsWith("@s.whatsapp.net")) return null;
  const value = sourceId.slice(0, -"@s.whatsapp.net".length).split(":")[0] ?? "";
  return /^\d{6,20}$/.test(value) ? value : null;
}

function errorCode(error: unknown): string {
  if (error instanceof z.ZodError) return "INVALID_PROVIDER_PAYLOAD";
  if (error instanceof SahelFlowError) return error.code.slice(0, 128);
  if (error instanceof Error && error.name) return error.name.slice(0, 128);
  return "INGRESS_PROCESSING_FAILED";
}

function isQuarantineError(error: unknown): boolean {
  return error instanceof z.ZodError || error instanceof ConflictError;
}

const ingressSelect = {
  id: true,
  ingressKey: true,
  payloadJson: true,
  payloadHash: true,
  status: true,
  attemptCount: true,
  operatorRetryCount: true,
  nextAttemptAt: true,
  lockedAt: true,
  leaseToken: true,
  providerTimestamp: true,
  conversationId: true,
  messageId: true,
  lastErrorCode: true,
} as const;

async function readIngress(
  context: ServiceContext,
  ingressEventId: string,
): Promise<IngressRow> {
  const row = await context.prisma.providerIngressEvent.findUnique({
    where: { id: ingressEventId },
    select: ingressSelect,
  });
  if (!row) {
    throw new SahelFlowError(
      "WhatsApp ingress event not found",
      "NOT_FOUND",
      404,
    );
  }
  return row as IngressRow;
}

async function closeExpiredLeaseAttempt(
  tx: Parameters<Parameters<ServiceContext["prisma"]["$transaction"]>[0]>[0],
  current: IngressRow,
  now: Date,
): Promise<void> {
  if (current.status !== "processing" || !current.leaseToken) return;
  await tx.providerIngressAttempt.updateMany({
    where: {
      ingressEventId: current.id,
      leaseToken: current.leaseToken,
      state: "processing",
    },
    data: {
      state: "lease_expired",
      errorCode: "LEASE_EXPIRED",
      detailJson: JSON.stringify({
        retryable: true,
        category: "expired-processing-lease",
      }),
      completedAt: now,
    },
  });
}

async function claimIngress(
  context: ServiceContext,
  ingressEventId: string,
): Promise<ClaimedIngress | IngressRow> {
  return context.prisma.$transaction(async (tx) => {
    const row = await tx.providerIngressEvent.findUnique({
      where: { id: ingressEventId },
      select: ingressSelect,
    });
    if (!row) {
      throw new SahelFlowError(
        "WhatsApp ingress event not found",
        "NOT_FOUND",
        404,
      );
    }

    const current = row as IngressRow;
    if (["applied", "quarantined", "dead_letter"].includes(current.status)) {
      return current;
    }

    const now = new Date();
    if (
      current.status === "processing" &&
      current.lockedAt &&
      current.lockedAt.getTime() > now.getTime() - LEASE_MS
    ) {
      return current;
    }
    if (
      current.status === "retrying" &&
      current.nextAttemptAt &&
      current.nextAttemptAt > now
    ) {
      return current;
    }

    await closeExpiredLeaseAttempt(tx, current, now);

    const attemptNumber = current.attemptCount + 1;
    const budget = attemptBudget(current.operatorRetryCount);
    if (attemptNumber > budget) {
      await tx.providerIngressEvent.update({
        where: { id: current.id },
        data: {
          status: "dead_letter",
          deadLetteredAt: now,
          lastErrorCode: current.lastErrorCode ?? "ATTEMPT_BUDGET_EXHAUSTED",
          lockedAt: null,
          leaseToken: null,
          nextAttemptAt: null,
        },
      });
      return {
        ...current,
        status: "dead_letter",
        lockedAt: null,
        leaseToken: null,
        nextAttemptAt: null,
        lastErrorCode:
          current.lastErrorCode ?? "ATTEMPT_BUDGET_EXHAUSTED",
      };
    }

    const activeLeaseToken = randomUUID();
    const updated = await tx.providerIngressEvent.updateMany({
      where: {
        id: current.id,
        status: current.status,
        attemptCount: current.attemptCount,
        operatorRetryCount: current.operatorRetryCount,
      },
      data: {
        status: "processing",
        attemptCount: attemptNumber,
        lockedAt: now,
        leaseToken: activeLeaseToken,
        nextAttemptAt: null,
        lastErrorCode: null,
      },
    });
    if (updated.count !== 1) return current;

    const attemptId = randomUUID();
    await tx.providerIngressAttempt.create({
      data: {
        id: attemptId,
        ingressEventId: current.id,
        attemptNumber,
        leaseToken: activeLeaseToken,
        state: "processing",
      },
    });

    return {
      ...current,
      status: "processing",
      attemptCount: attemptNumber,
      nextAttemptAt: null,
      lockedAt: now,
      leaseToken: activeLeaseToken,
      lastErrorCode: null,
      attemptNumber,
      attemptId,
      activeLeaseToken,
    };
  });
}

function isClaim(value: ClaimedIngress | IngressRow): value is ClaimedIngress {
  return "attemptId" in value && "activeLeaseToken" in value;
}

async function openEnvelope(
  context: ServiceContext,
  claim: ClaimedIngress,
): Promise<WhatsAppInboundEnvelope> {
  const envelopeKey = await getBusinessEnvelopeKey(context);
  const payload = openBusinessCommandResultWithKey<unknown>(
    claim.payloadJson,
    {
      commandId: claim.id,
      idempotencyKey: `provider-ingress:${claim.ingressKey}`,
      requestHash: claim.payloadHash,
    },
    envelopeKey,
  );
  return whatsappInboundEnvelopeSchema.parse(payload);
}

async function markFailure(
  context: ServiceContext,
  claim: ClaimedIngress,
  error: unknown,
): Promise<WhatsAppIngressProcessingResult> {
  const code = errorCode(error);
  const quarantine = isQuarantineError(error);
  const exhausted =
    claim.attemptNumber >= attemptBudget(claim.operatorRetryCount);
  const state: WhatsAppIngressProcessingState = quarantine
    ? "quarantined"
    : exhausted
      ? "dead_letter"
      : "retrying";
  const now = new Date();
  const currentBudgetAttempt = attemptWithinCurrentBudget(
    claim.attemptNumber,
    claim.operatorRetryCount,
  );
  const nextAttemptAt =
    state === "retrying"
      ? new Date(now.getTime() + retryDelay(currentBudgetAttempt))
      : null;

  await context.prisma.$transaction(async (tx) => {
    await tx.providerIngressAttempt.updateMany({
      where: {
        id: claim.attemptId,
        ingressEventId: claim.id,
        leaseToken: claim.activeLeaseToken,
        state: "processing",
      },
      data: {
        state,
        errorCode: code,
        detailJson: JSON.stringify({
          retryable: state === "retrying",
          category: quarantine ? "invalid-or-conflicting-provider-input" : "processing",
          operatorRetryCount: claim.operatorRetryCount,
        }),
        completedAt: now,
      },
    });
    await tx.providerIngressEvent.updateMany({
      where: {
        id: claim.id,
        status: "processing",
        leaseToken: claim.activeLeaseToken,
      },
      data: {
        status: state,
        lastErrorCode: code,
        nextAttemptAt,
        lockedAt: null,
        leaseToken: null,
        quarantinedAt: state === "quarantined" ? now : undefined,
        deadLetteredAt: state === "dead_letter" ? now : undefined,
      },
    });
  });

  return {
    ingressEventId: claim.id,
    state,
    conversationId: null,
    messageId: null,
    publish: false,
    errorCode: code,
  };
}

async function applyClaim(
  context: ServiceContext,
  claim: ClaimedIngress,
  input: WhatsAppInboundEnvelope,
): Promise<WhatsAppIngressProcessingResult> {
  const providerTimestamp =
    claim.providerTimestamp ?? new Date(input.message.messageTimestamp * 1_000);
  const sourceId = input.message.key.remoteJid;
  const contactPhone = jidPhone(sourceId);
  const contactName = input.message.pushName?.trim() || contactPhone || sourceId;
  const body = messageText(input.message.message);
  const canonicalMessageType = messageType(input);
  const commandContext = {
    ...context,
    businessPrincipal: providerBusinessPrincipal("whatsapp"),
  };

  const execution = await executeBusinessCommand(
    commandContext,
    {
      idempotencyKey: `provider-ingress-apply:${claim.ingressKey}`,
      commandType: WHATSAPP_INGRESS_COMMAND_TYPE,
      aggregate: {
        type: "provider-ingress",
        id: claim.id,
        expectedVersion: 0,
      },
      actor: "provider:whatsapp",
      correlationId: claim.id,
      causationId: input.message.key.id,
      payload: {
        ingressEventId: claim.id,
        ingressKey: claim.ingressKey,
        sourceId,
        providerEventId: input.message.key.id,
        providerTimestamp: providerTimestamp.toISOString(),
      },
    },
    async ({ tx }) => {
      const conversation = await tx.conversation.upsert({
        where: {
          channel_sourceId: {
            channel: "whatsapp",
            sourceId,
          },
        },
        create: {
          channel: "whatsapp",
          contactName,
          contactPhone,
          sourceId,
          lastMessageAt: providerTimestamp,
          unreadCount: 1,
          status: "open",
          waitingSince: providerTimestamp,
        },
        update: {
          contactName,
          contactPhone,
          lastMessageAt: providerTimestamp,
          unreadCount: { increment: 1 },
          status: "open",
          snoozedUntil: null,
          waitingSince: providerTimestamp,
        },
        select: { id: true },
      });

      await tx.message.create({
        data: {
          id: claim.id,
          conversationId: conversation.id,
          body,
          direction: "inbound",
          timestamp: providerTimestamp,
          deliveryStatus: null,
          messageType: canonicalMessageType,
        },
      });

      const applied = await tx.providerIngressEvent.updateMany({
        where: {
          id: claim.id,
          status: "processing",
          leaseToken: claim.activeLeaseToken,
        },
        data: {
          status: "applied",
          conversationId: conversation.id,
          messageId: claim.id,
          appliedAt: new Date(),
          lastErrorCode: null,
          nextAttemptAt: null,
          lockedAt: null,
          leaseToken: null,
        },
      });
      if (applied.count !== 1) {
        throw new ConflictError(
          "WhatsApp ingress lease changed before canonical application",
        );
      }

      await tx.providerIngressAttempt.update({
        where: { id: claim.attemptId },
        data: {
          state: "succeeded",
          completedAt: new Date(),
          errorCode: null,
        },
      });

      return {
        result: {
          conversationId: conversation.id,
          messageId: claim.id,
        },
        audit: {
          action: "whatsapp.message.received",
          entity: "message",
          entityId: claim.id,
          after: {
            direction: "inbound",
            messageType: canonicalMessageType,
          },
          metadata: {
            ingressEventId: claim.id,
            source: "whatsapp",
          },
        },
        events: [
          {
            key: `provider-ingress:${claim.ingressKey}:applied`,
            type: "whatsapp.message.received.v1",
            payload: {
              ingressEventId: claim.id,
              conversationId: conversation.id,
              messageId: claim.id,
              sourceId,
              providerEventId: input.message.key.id,
              providerTimestamp: providerTimestamp.toISOString(),
              messageType: canonicalMessageType,
            },
          },
        ],
        outbox: [
          {
            effectKey: `automation-trigger:message.received:${claim.ingressKey}`,
            effectType: AUTOMATION_TRIGGER_EFFECT_TYPE,
            payload: {
              trigger: "message.received",
              ingressEventId: claim.id,
              conversationId: conversation.id,
              messageId: claim.id,
              customerName: contactName,
              customerPhone: contactPhone,
              messageText: body,
              source: "whatsapp",
              sourceId,
            },
          },
        ],
        projectionInvalidations: [
          "inbox.conversations",
          `inbox.conversation:${conversation.id}`,
        ],
      };
    },
  );

  return {
    ingressEventId: claim.id,
    state: "applied",
    conversationId: execution.result.conversationId,
    messageId: execution.result.messageId,
    publish: true,
    errorCode: null,
  };
}

export async function processWhatsAppInbound(
  context: ServiceContext,
  ingressEventId: string,
): Promise<WhatsAppIngressProcessingResult> {
  const current = await readIngress(context, ingressEventId);
  if (["applied", "quarantined", "dead_letter"].includes(current.status)) {
    return publicResult(current);
  }

  const claimed = await claimIngress(context, ingressEventId);
  if (!isClaim(claimed)) return publicResult(claimed);

  try {
    return await applyClaim(context, claimed, await openEnvelope(context, claimed));
  } catch (error) {
    return markFailure(context, claimed, error);
  }
}
