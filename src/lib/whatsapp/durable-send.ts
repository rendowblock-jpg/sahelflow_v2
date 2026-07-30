import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";

import type {
  BusinessPrincipalContext,
  TrustedBusinessPrincipal,
} from "@/lib/business-truth/principal";
import { executeBusinessCommand } from "@/lib/business-truth/command-kernel";
import { getBusinessEnvelopeKey } from "@/lib/business-truth/envelope-key";
import { openBusinessPayloadWithKey } from "@/lib/business-truth/payload-codec";
import type { ServiceContext } from "@/lib/data/service-base";
import { ConflictError, SahelFlowError } from "@/types/errors";
import {
  sidecar,
  SidecarRequestError,
  SidecarUnavailableError,
} from "./sidecar-client";
import { createWhatsAppEffectAuthority } from "./effect-authority";
import { normalizeWhatsAppJid } from "./types";

export const WHATSAPP_TEXT_EFFECT_TYPE = "whatsapp.text.send.v1";
const MAX_ATTEMPTS = 6;
const LEASE_MS = 90_000;
const RETRY_DELAYS_MS = [5_000, 30_000, 120_000, 600_000, 1_800_000] as const;

const queuedPayloadSchema = z.object({
  messageId: z.string().uuid(),
  to: z.string().min(1).max(256),
  text: z.string().min(1).max(4000),
  requestBinding: z.string().regex(/^[0-9a-f]{64}$/),
});

type TrustedWhatsAppCommandContext = BusinessPrincipalContext & {
  readonly businessPrincipal: TrustedBusinessPrincipal;
};

export interface QueueWhatsAppTextInput {
  clientMessageId: string;
  to: string;
  text: string;
}

interface OutboxRow {
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
  effectStartedAt: Date | null;
  lastErrorCode: string | null;
  outcomeState: string;
  receiptJson: string | null;
  succeededAt: Date | null;
  deadLetteredAt: Date | null;
}

export type WhatsAppEffectState =
  | "queued"
  | "processing"
  | "retrying"
  | "succeeded"
  | "ambiguous"
  | "dead_letter";

export interface WhatsAppEffectStatus {
  effectKey: string;
  messageId: string | null;
  providerMessageId: string | null;
  state: WhatsAppEffectState;
  attemptCount: number;
  nextAttemptAt: string | null;
  errorCode: string | null;
  requiresDuplicateConfirmation: boolean;
}

interface SendReceipt {
  ok: boolean;
  id: string;
  status: string;
}

export type WhatsAppEffectSender = (
  to: string,
  text: string,
  effectKey: string,
  requestBinding: string,
) => Promise<SendReceipt>;

function safeReceipt(receiptJson: string | null): { id?: string } {
  if (!receiptJson) return {};
  try {
    const parsed = JSON.parse(receiptJson) as { id?: unknown };
    return typeof parsed.id === "string" ? { id: parsed.id } : {};
  } catch {
    return {};
  }
}

function publicState(row: OutboxRow, messageId: string | null): WhatsAppEffectStatus {
  const receipt = safeReceipt(row.receiptJson);
  const state: WhatsAppEffectState =
    row.status === "failed" && row.outcomeState === "ambiguous"
      ? "ambiguous"
      : row.status === "dead_letter"
        ? "dead_letter"
        : row.status === "succeeded"
          ? "succeeded"
          : row.status === "processing"
            ? "processing"
            : row.status === "retrying"
              ? "retrying"
              : "queued";
  return {
    effectKey: row.effectKey,
    messageId,
    providerMessageId: receipt.id ?? null,
    state,
    attemptCount: row.attemptCount,
    nextAttemptAt: row.nextAttemptAt?.toISOString() ?? null,
    errorCode: row.lastErrorCode,
    requiresDuplicateConfirmation: state === "ambiguous",
  };
}

async function readRow(context: ServiceContext, effectKey: string): Promise<OutboxRow> {
  const row = await context.prisma.outboxIntent.findUnique({ where: { effectKey } });
  if (!row || row.effectType !== WHATSAPP_TEXT_EFFECT_TYPE) {
    throw new SahelFlowError("WhatsApp send intent not found", "NOT_FOUND", 404);
  }
  return row as OutboxRow;
}

async function readEffect(
  context: ServiceContext,
  effectKey: string,
): Promise<{ messageId: string; providerMessageId: string | null } | null> {
  return context.prisma.whatsAppOutboundEffect.findUnique({
    where: { effectKey },
    select: { messageId: true, providerMessageId: true },
  });
}

async function setMessageDeliveryByEffect(
  tx: Parameters<Parameters<ServiceContext["prisma"]["$transaction"]>[0]>[0],
  effectKey: string,
  deliveryStatus: string,
): Promise<void> {
  const effect = await tx.whatsAppOutboundEffect.findUnique({
    where: { effectKey },
    select: { messageId: true },
  });
  if (effect) {
    await tx.message.updateMany({
      where: { id: effect.messageId },
      data: { deliveryStatus },
    });
  }
}

export async function queueWhatsAppText(
  context: TrustedWhatsAppCommandContext,
  input: QueueWhatsAppTextInput,
): Promise<{ effectKey: string; messageId: string; replayed: boolean }> {
  const clientMessageId = z.string().uuid().parse(input.clientMessageId);
  const text = z.string().trim().min(1).max(4000).parse(input.text);
  let jid: string;
  try {
    jid = normalizeWhatsAppJid(input.to);
  } catch {
    throw new SahelFlowError(
      "WhatsApp recipient must be a valid Algerian mobile number",
      "VALIDATION_ERROR",
      400,
    );
  }

  const { effectKey, requestBinding } = await createWhatsAppEffectAuthority(
    context,
    "text",
    clientMessageId,
    jid,
    text,
  );
  const phone = jid.slice(0, jid.indexOf("@"));
  const now = new Date();

  const execution = await executeBusinessCommand(
    context,
    {
      idempotencyKey: effectKey,
      commandType: "whatsapp_message.queue.v1",
      aggregate: {
        type: "whatsapp-message",
        id: clientMessageId,
        expectedVersion: 0,
      },
      actor: context.businessPrincipal.auditActor,
      correlationId: clientMessageId,
      payload: { messageId: clientMessageId, to: jid, text, requestBinding },
    },
    async ({ tx }) => {
      const conversation = await tx.conversation.upsert({
        where: {
          channel_sourceId: { channel: "whatsapp", sourceId: jid },
        },
        create: {
          channel: "whatsapp",
          contactName: phone,
          contactPhone: phone,
          sourceId: jid,
          lastMessageAt: now,
        },
        update: { lastMessageAt: now },
        select: { id: true },
      });
      await tx.message.create({
        data: {
          id: clientMessageId,
          conversationId: conversation.id,
          body: text,
          direction: "outbound",
          timestamp: now,
          deliveryStatus: "sending",
        },
      });
      await tx.whatsAppOutboundEffect.create({
        data: { effectKey, messageId: clientMessageId },
      });
      return {
        result: { effectKey, messageId: clientMessageId },
        audit: {
          action: "whatsapp.message.queued",
          entity: "message",
          entityId: clientMessageId,
          metadata: { effectKey, conversationId: conversation.id },
        },
        events: [
          {
            key: `${effectKey}:queued`,
            type: "whatsapp.message.queued.v1",
            payload: { messageId: clientMessageId, conversationId: conversation.id },
          },
        ],
        outbox: [
          {
            effectKey,
            effectType: WHATSAPP_TEXT_EFFECT_TYPE,
            payload: { messageId: clientMessageId, to: jid, text, requestBinding },
          },
        ],
        projectionInvalidations: [`conversation:${conversation.id}`, "inbox"],
      };
    },
  );

  return { ...execution.result, replayed: execution.replayed };
}

async function recoverExpiredLeases(context: ServiceContext, now = new Date()): Promise<void> {
  const expired = await context.prisma.outboxIntent.findMany({
    where: {
      effectType: WHATSAPP_TEXT_EFFECT_TYPE,
      status: "processing",
      lockedAt: { lt: new Date(now.getTime() - LEASE_MS) },
    },
    select: { id: true, effectKey: true, effectStartedAt: true },
  });
  for (const intent of expired) {
    const ambiguous = intent.effectStartedAt !== null;
    const errorCode = ambiguous
      ? "WORKER_LEASE_EXPIRED_AFTER_EFFECT_START"
      : "WORKER_LEASE_EXPIRED_BEFORE_EFFECT";
    await context.prisma.$transaction(async (tx) => {
      const marked = await tx.outboxIntent.updateMany({
        where: { id: intent.id, status: "processing" },
        data: {
          status: ambiguous ? "failed" : "dead_letter",
          outcomeState: ambiguous ? "ambiguous" : "none",
          lastErrorCode: errorCode,
          lockedAt: null,
          leaseToken: null,
          nextAttemptAt: null,
          deadLetteredAt: ambiguous ? null : now,
        },
      });
      if (marked.count === 1) {
        await setMessageDeliveryByEffect(tx, intent.effectKey, "failed");
        await tx.auditLog.create({
          data: {
            action: ambiguous
              ? "whatsapp.message.outcome_ambiguous"
              : "whatsapp.message.dead_lettered",
            entity: "outbox-intent",
            entityId: intent.id,
            actor: "system:whatsapp-outbox",
            metadata: JSON.stringify({ effectKey: intent.effectKey, errorCode }),
          },
        });
      }
    });
  }
}

async function claimIntent(
  context: ServiceContext,
  effectKey?: string,
): Promise<OutboxRow | null> {
  const now = new Date();
  await recoverExpiredLeases(context, now);
  const candidate = await context.prisma.outboxIntent.findFirst({
    where: {
      effectType: WHATSAPP_TEXT_EFFECT_TYPE,
      ...(effectKey ? { effectKey } : {}),
      OR: [
        { status: "queued" },
        { status: "retrying", nextAttemptAt: { lte: now } },
      ],
    },
    orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
  });
  if (!candidate) return null;
  const leaseToken = randomUUID();
  const claimed = await context.prisma.outboxIntent.updateMany({
    where: {
      id: candidate.id,
      status: candidate.status,
      ...(candidate.status === "retrying" ? { nextAttemptAt: candidate.nextAttemptAt } : {}),
    },
    data: {
      status: "processing",
      attemptCount: { increment: 1 },
      lockedAt: now,
      leaseToken,
      nextAttemptAt: null,
      lastErrorCode: null,
      outcomeState: "none",
      effectStartedAt: null,
    },
  });
  if (claimed.count !== 1) return null;
  return context.prisma.outboxIntent.findFirstOrThrow({
    where: { id: candidate.id, leaseToken },
  }) as Promise<OutboxRow>;
}

function failureDisposition(error: unknown): {
  code: string;
  retryable: boolean;
  ambiguous: boolean;
} {
  if (error instanceof SidecarRequestError) {
    return {
      code: error.code.slice(0, 100),
      retryable: error.retryable,
      ambiguous: error.ambiguous,
    };
  }
  if (error instanceof SidecarUnavailableError) {
    return {
      code: error.ambiguous ? "SIDECAR_NETWORK_AMBIGUOUS" : "SIDECAR_UNAVAILABLE",
      retryable: !error.ambiguous,
      ambiguous: error.ambiguous,
    };
  }
  return { code: "UNCLASSIFIED_PROVIDER_FAILURE", retryable: false, ambiguous: true };
}

async function markFailure(
  context: ServiceContext,
  row: OutboxRow,
  error: unknown,
): Promise<WhatsAppEffectStatus> {
  const disposition = failureDisposition(error);
  const exhausted = row.attemptCount >= MAX_ATTEMPTS;
  const ambiguous = disposition.ambiguous;
  const retrying = disposition.retryable && !ambiguous && !exhausted;
  const nextAttemptAt = retrying
    ? new Date(
        Date.now() +
          RETRY_DELAYS_MS[Math.min(row.attemptCount - 1, RETRY_DELAYS_MS.length - 1)]!,
      )
    : null;
  const status = ambiguous ? "failed" : retrying ? "retrying" : "dead_letter";

  await context.prisma.$transaction(async (tx) => {
    const marked = await tx.outboxIntent.updateMany({
      where: { id: row.id, status: "processing", leaseToken: row.leaseToken },
      data: {
        status,
        outcomeState: ambiguous ? "ambiguous" : "none",
        lastErrorCode: disposition.code,
        nextAttemptAt,
        lockedAt: null,
        leaseToken: null,
        effectStartedAt: retrying ? null : row.effectStartedAt,
        deadLetteredAt: status === "dead_letter" ? new Date() : null,
      },
    });
    if (marked.count !== 1) {
      throw new ConflictError("WhatsApp send intent lease changed during failure recording");
    }
    if (!retrying) await setMessageDeliveryByEffect(tx, row.effectKey, "failed");
    await tx.auditLog.create({
      data: {
        action: ambiguous
          ? "whatsapp.message.outcome_ambiguous"
          : retrying
            ? "whatsapp.message.retry_scheduled"
            : "whatsapp.message.dead_lettered",
        entity: "outbox-intent",
        entityId: row.id,
        actor: "system:whatsapp-outbox",
        metadata: JSON.stringify({
          effectKey: row.effectKey,
          attemptCount: row.attemptCount,
          errorCode: disposition.code,
          nextAttemptAt: nextAttemptAt?.toISOString() ?? null,
        }),
      },
    });
  });
  return getWhatsAppEffectStatus(context, row.effectKey);
}

async function markPreEffectFailure(
  context: ServiceContext,
  row: OutboxRow,
  errorCode: "OUTBOX_PAYLOAD_INVALID" | "OUTBOX_EFFECT_START_FAILED",
): Promise<WhatsAppEffectStatus> {
  await context.prisma.$transaction(async (tx) => {
    const marked = await tx.outboxIntent.updateMany({
      where: { id: row.id, status: "processing", leaseToken: row.leaseToken },
      data: {
        status: "dead_letter",
        outcomeState: "none",
        lastErrorCode: errorCode,
        nextAttemptAt: null,
        lockedAt: null,
        leaseToken: null,
        effectStartedAt: null,
        deadLetteredAt: new Date(),
      },
    });
    if (marked.count !== 1) {
      throw new ConflictError("WhatsApp send intent lease changed before dispatch");
    }
    await setMessageDeliveryByEffect(tx, row.effectKey, "failed");
    await tx.auditLog.create({
      data: {
        action: "whatsapp.message.dead_lettered_before_effect",
        entity: "outbox-intent",
        entityId: row.id,
        actor: "system:whatsapp-outbox",
        metadata: JSON.stringify({
          effectKey: row.effectKey,
          attemptCount: row.attemptCount,
          errorCode,
          providerCallStarted: false,
        }),
      },
    });
  });
  return getWhatsAppEffectStatus(context, row.effectKey);
}

async function markEffectStarted(context: ServiceContext, row: OutboxRow): Promise<OutboxRow> {
  const effectStartedAt = new Date();
  const marked = await context.prisma.outboxIntent.updateMany({
    where: { id: row.id, status: "processing", leaseToken: row.leaseToken },
    data: { effectStartedAt },
  });
  if (marked.count !== 1) {
    throw new ConflictError("WhatsApp send intent lease changed before dispatch");
  }
  return { ...row, effectStartedAt };
}

async function markSucceeded(
  context: ServiceContext,
  row: OutboxRow,
  payload: z.infer<typeof queuedPayloadSchema>,
  receipt: SendReceipt,
): Promise<WhatsAppEffectStatus> {
  const providerMessageId = receipt.id.trim();
  if (!receipt.ok || !providerMessageId) {
    return markFailure(
      context,
      row,
      new SidecarRequestError(
        "Provider returned an incomplete receipt",
        "INCOMPLETE_PROVIDER_RECEIPT",
        false,
        true,
        502,
      ),
    );
  }
  try {
    await context.prisma.$transaction(async (tx) => {
      const marked = await tx.outboxIntent.updateMany({
        where: { id: row.id, status: "processing", leaseToken: row.leaseToken },
        data: {
          status: "succeeded",
          outcomeState: "receipt",
          receiptJson: JSON.stringify({ id: providerMessageId, status: receipt.status }),
          succeededAt: new Date(),
          lockedAt: null,
          leaseToken: null,
          nextAttemptAt: null,
          lastErrorCode: null,
        },
      });
      if (marked.count !== 1) {
        throw new ConflictError("WhatsApp send intent lease changed before receipt commit");
      }
      const effect = await tx.whatsAppOutboundEffect.updateMany({
        where: { effectKey: row.effectKey, messageId: payload.messageId },
        data: { providerMessageId },
      });
      if (effect.count !== 1) {
        throw new ConflictError("WhatsApp receipt has no matching durable effect row");
      }
      const message = await tx.message.updateMany({
        where: { id: payload.messageId },
        data: { deliveryStatus: "sent" },
      });
      if (message.count !== 1) {
        throw new ConflictError("WhatsApp provider receipt has no matching local message");
      }
      await tx.auditLog.create({
        data: {
          action: "whatsapp.message.sent",
          entity: "message",
          entityId: payload.messageId,
          actor: "system:whatsapp-outbox",
          metadata: JSON.stringify({
            effectKey: row.effectKey,
            providerMessageId,
            attemptCount: row.attemptCount,
          }),
        },
      });
    });
  } catch {
    return markFailure(
      context,
      row,
      new SidecarRequestError(
        "Provider receipt could not be committed locally",
        "LOCAL_RECEIPT_COMMIT_FAILED",
        false,
        true,
        500,
      ),
    );
  }
  return getWhatsAppEffectStatus(context, row.effectKey);
}

async function openClaimedPayload(
  context: ServiceContext,
  claimed: OutboxRow,
): Promise<z.infer<typeof queuedPayloadSchema>> {
  const envelopeKey = await getBusinessEnvelopeKey(context);
  return queuedPayloadSchema.parse(
    openBusinessPayloadWithKey(
      claimed.payloadJson,
      {
        kind: "outbox-intent",
        recordKey: claimed.effectKey,
        recordType: claimed.effectType,
        commandId: claimed.commandId,
      },
      envelopeKey,
    ),
  );
}

async function executeClaimed(
  context: ServiceContext,
  claimed: OutboxRow,
  sender: WhatsAppEffectSender,
): Promise<WhatsAppEffectStatus> {
  let payload: z.infer<typeof queuedPayloadSchema>;
  try {
    payload = await openClaimedPayload(context, claimed);
  } catch {
    return markPreEffectFailure(context, claimed, "OUTBOX_PAYLOAD_INVALID");
  }
  let started: OutboxRow;
  try {
    started = await markEffectStarted(context, claimed);
  } catch {
    return markPreEffectFailure(context, claimed, "OUTBOX_EFFECT_START_FAILED");
  }
  try {
    return markSucceeded(
      context,
      started,
      payload,
      await sender(payload.to, payload.text, started.effectKey, payload.requestBinding),
    );
  } catch (error) {
    return markFailure(context, started, error);
  }
}

export async function processWhatsAppEffect(
  context: ServiceContext,
  effectKey: string,
  sender: WhatsAppEffectSender = sidecar.send,
): Promise<WhatsAppEffectStatus> {
  const claimed = await claimIntent(context, effectKey);
  if (!claimed) return getWhatsAppEffectStatus(context, effectKey);
  return executeClaimed(context, claimed, sender);
}

export async function drainDueWhatsAppEffects(
  context: ServiceContext,
  limit = 10,
  sender: WhatsAppEffectSender = sidecar.send,
): Promise<WhatsAppEffectStatus[]> {
  const bounded = Math.max(1, Math.min(limit, 25));
  const results: WhatsAppEffectStatus[] = [];
  for (let index = 0; index < bounded; index += 1) {
    const claimed = await claimIntent(context);
    if (!claimed) break;
    results.push(await executeClaimed(context, claimed, sender));
  }
  return results;
}

export async function getWhatsAppEffectStatus(
  context: ServiceContext,
  effectKey: string,
): Promise<WhatsAppEffectStatus> {
  const row = await readRow(context, effectKey);
  const effect = await readEffect(context, effectKey);
  return publicState(row, effect?.messageId ?? null);
}

export async function findWhatsAppEffectByMessageId(
  context: ServiceContext,
  messageId: string,
): Promise<WhatsAppEffectStatus> {
  const id = z.string().uuid().parse(messageId);
  const effect = await context.prisma.whatsAppOutboundEffect.findUnique({
    where: { messageId: id },
    select: { effectKey: true },
  });
  if (!effect) {
    throw new SahelFlowError("WhatsApp send intent not found", "NOT_FOUND", 404);
  }
  return getWhatsAppEffectStatus(context, effect.effectKey);
}

export async function retryWhatsAppEffect(
  context: TrustedWhatsAppCommandContext,
  effectKey: string,
  confirmMayDuplicate: boolean,
  sender: WhatsAppEffectSender = sidecar.send,
): Promise<WhatsAppEffectStatus> {
  const row = await readRow(context, effectKey);
  const ambiguous = row.status === "failed" && row.outcomeState === "ambiguous";
  if (row.status !== "dead_letter" && !ambiguous) {
    throw new ConflictError("Only dead-lettered or ambiguous WhatsApp sends can be retried");
  }
  if (ambiguous && !confirmMayDuplicate) {
    throw new ConflictError(
      "This send may already have reached WhatsApp. Confirm duplicate risk before retrying.",
    );
  }
  await context.prisma.$transaction(async (tx) => {
    const reset = await tx.outboxIntent.updateMany({
      where: {
        id: row.id,
        status: row.status,
        outcomeState: row.outcomeState,
      },
      data: {
        status: "queued",
        outcomeState: "none",
        lastErrorCode: null,
        nextAttemptAt: null,
        lockedAt: null,
        leaseToken: null,
        effectStartedAt: null,
        deadLetteredAt: null,
      },
    });
    if (reset.count !== 1) {
      throw new ConflictError("WhatsApp send recovery state changed; refresh and retry");
    }
    await setMessageDeliveryByEffect(tx, effectKey, "sending");
    await tx.auditLog.create({
      data: {
        action: "whatsapp.message.operator_retry",
        entity: "outbox-intent",
        entityId: row.id,
        actor: context.businessPrincipal.auditActor,
        metadata: JSON.stringify({
          effectKey,
          previousOutcome: ambiguous ? "ambiguous" : "dead_letter",
          duplicateRiskConfirmed: ambiguous,
        }),
      },
    });
  });
  return processWhatsAppEffect(context, effectKey, sender);
}