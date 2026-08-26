import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

import { executeBusinessCommand } from "@/lib/business-truth/command-kernel";
import { getBusinessEnvelopeKey } from "@/lib/business-truth/envelope-key";
import {
  openBusinessPayloadWithKey,
  sealBusinessPayloadWithKey,
} from "@/lib/business-truth/payload-codec";
import { providerBusinessPrincipal } from "@/lib/business-truth/principal";
import { openBusinessCommandResultWithKey } from "@/lib/business-truth/result-codec";
import type { ServiceContext } from "@/lib/data/service-base";
import { ConflictError } from "@/types/errors";
import {
  whatsappInboundEnvelopeSchema,
  type WhatsAppInboundEnvelope,
} from "./inbound-ingress";
import {
  openWhatsAppMessageAttachment,
  type WhatsAppMessageAttachment,
} from "./message-attachments";
import {
  WHATSAPP_MEDIA_FETCH_EFFECT_TYPE,
  whatsAppMediaFetchPayloadSchema,
} from "./media-fetch-contract";
import {
  type WhatsAppBinaryMediaKind,
  WhatsAppMediaObjectError,
  type WhatsAppMediaObjectReceipt,
  verifyWhatsAppMediaObject,
  whatsAppMediaRoot,
  writeWhatsAppMediaObject,
} from "./media-object-store";
import {
  sidecar,
  SidecarRequestError,
  SidecarUnavailableError,
} from "./sidecar-client";
import type { IncomingMessage } from "./types";

const MAX_ATTEMPTS = 8;
const LEASE_MS = 120_000;
const RETRY_DELAYS_MS = [5_000, 30_000, 120_000, 600_000, 1_800_000, 7_200_000] as const;
const MAX_RETRY_DELAY_MS = 7_200_000;
const BINARY_KINDS = new Set<WhatsAppBinaryMediaKind>([
  "image",
  "video",
  "audio",
  "document",
  "sticker",
]);

export type WhatsAppMediaDownloader = (
  message: IncomingMessage,
) => Promise<Response>;

interface MediaIntentRow {
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
}

function effectKey(messageId: string): string {
  return `whatsapp-media-fetch:${messageId}`;
}

function retryDelay(attemptCount: number): number {
  return RETRY_DELAYS_MS[
    Math.min(Math.max(0, attemptCount - 1), RETRY_DELAYS_MS.length - 1)
  ] ?? MAX_RETRY_DELAY_MS;
}

function binaryKind(
  attachment: WhatsAppMessageAttachment | null,
): WhatsAppBinaryMediaKind | null {
  if (!attachment || !BINARY_KINDS.has(attachment.kind as WhatsAppBinaryMediaKind)) {
    return null;
  }
  return attachment.kind as WhatsAppBinaryMediaKind;
}

async function queueMediaFetch(
  context: ServiceContext,
  messageId: string,
): Promise<void> {
  const commandContext = {
    ...context,
    businessPrincipal: providerBusinessPrincipal("whatsapp"),
  };
  const key = effectKey(messageId);
  await executeBusinessCommand(
    commandContext,
    {
      idempotencyKey: key,
      commandType: "whatsapp_media.fetch.queue.v1",
      aggregate: {
        type: "whatsapp-media-fetch",
        id: messageId,
        expectedVersion: 0,
      },
      actor: "provider:whatsapp",
      correlationId: messageId,
      causationId: messageId,
      payload: { messageId, ingressEventId: messageId },
    },
    async () => ({
      result: { effectKey: key, messageId },
      audit: {
        action: "whatsapp.media.fetch_queued",
        entity: "message",
        entityId: messageId,
        metadata: { effectKey: key },
      },
      events: [
        {
          key: `${key}:queued`,
          type: "whatsapp.media.fetch.queued.v1",
          payload: { messageId },
        },
      ],
      outbox: [
        {
          effectKey: key,
          effectType: WHATSAPP_MEDIA_FETCH_EFFECT_TYPE,
          payload: { messageId, ingressEventId: messageId },
        },
      ],
      projectionInvalidations: [`inbox.message:${messageId}`],
    }),
  );
}

export async function reconcileQueuedWhatsAppMediaFetches(
  context: ServiceContext,
  limit = 24,
): Promise<number> {
  const bounded = Math.max(1, Math.min(limit, 100));
  const rows = await context.prisma.$queryRaw<Array<{ id: string }>>`
    SELECT m."id" AS "id"
    FROM "Message" m
    INNER JOIN "ProviderIngressEvent" p
      ON p."messageId" = m."id"
    WHERE p."provider" = 'whatsapp'
      AND p."status" = 'applied'
      AND m."direction" = 'inbound'
      AND m."messageType" IN ('image', 'video', 'audio', 'document', 'sticker')
      AND NOT EXISTS (
        SELECT 1
        FROM "OutboxIntent" o
        WHERE o."effectKey" = ('whatsapp-media-fetch:' || m."id")
      )
    ORDER BY m."timestamp" ASC
    LIMIT ${bounded}
  `;
  for (const row of rows) await queueMediaFetch(context, row.id);
  return rows.length;
}

async function recoverExpiredLeases(
  context: ServiceContext,
  now: Date,
): Promise<void> {
  await context.prisma.outboxIntent.updateMany({
    where: {
      effectType: WHATSAPP_MEDIA_FETCH_EFFECT_TYPE,
      status: "processing",
      lockedAt: { lt: new Date(now.getTime() - LEASE_MS) },
    },
    data: {
      status: "retrying",
      nextAttemptAt: now,
      lockedAt: null,
      leaseToken: null,
      lastErrorCode: "MEDIA_FETCH_LEASE_RECOVERED",
      outcomeState: "none",
    },
  });
}

async function claimMediaIntent(
  context: ServiceContext,
): Promise<MediaIntentRow | null> {
  const now = new Date();
  await recoverExpiredLeases(context, now);
  const candidate = (await context.prisma.outboxIntent.findFirst({
    where: {
      effectType: WHATSAPP_MEDIA_FETCH_EFFECT_TYPE,
      status: { in: ["queued", "retrying"] },
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
    },
    orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
  })) as MediaIntentRow | null;
  if (!candidate) return null;
  if (candidate.attemptCount >= MAX_ATTEMPTS) {
    await context.prisma.outboxIntent.updateMany({
      where: { id: candidate.id, status: candidate.status },
      data: {
        status: "dead_letter",
        deadLetteredAt: now,
        nextAttemptAt: null,
        lastErrorCode: candidate.lastErrorCode ?? "MEDIA_FETCH_ATTEMPT_BUDGET_EXHAUSTED",
      },
    });
    return null;
  }
  const leaseToken = randomUUID();
  const claimed = await context.prisma.outboxIntent.updateMany({
    where: {
      id: candidate.id,
      status: candidate.status,
      attemptCount: candidate.attemptCount,
    },
    data: {
      status: "processing",
      attemptCount: { increment: 1 },
      lockedAt: now,
      leaseToken,
      nextAttemptAt: null,
      lastErrorCode: null,
      outcomeState: "none",
    },
  });
  if (claimed.count !== 1) return null;
  return {
    ...candidate,
    status: "processing",
    attemptCount: candidate.attemptCount + 1,
    lockedAt: now,
    leaseToken,
    nextAttemptAt: null,
    lastErrorCode: null,
  };
}

async function openIntentPayload(
  context: ServiceContext,
  row: MediaIntentRow,
) {
  const key = await getBusinessEnvelopeKey(context);
  try {
    return whatsAppMediaFetchPayloadSchema.parse(
      openBusinessPayloadWithKey(
        row.payloadJson,
        {
          kind: "outbox-intent",
          recordKey: row.effectKey,
          recordType: row.effectType,
          commandId: row.commandId,
        },
        key,
      ),
    );
  } finally {
    key.fill(0);
  }
}

async function openIngressEnvelope(
  context: ServiceContext,
  ingressEventId: string,
): Promise<WhatsAppInboundEnvelope> {
  const ingress = await context.prisma.providerIngressEvent.findUnique({
    where: { id: ingressEventId },
    select: {
      id: true,
      ingressKey: true,
      payloadJson: true,
      payloadHash: true,
      provider: true,
      status: true,
      messageId: true,
    },
  });
  if (
    !ingress ||
    ingress.provider !== "whatsapp" ||
    ingress.status !== "applied" ||
    ingress.messageId !== ingressEventId
  ) {
    throw new WhatsAppMediaObjectError(
      "Canonical WhatsApp ingress evidence is not available for media recovery",
      "MEDIA_OBJECT_CORRUPT",
    );
  }
  const key = await getBusinessEnvelopeKey(context);
  try {
    return whatsappInboundEnvelopeSchema.parse(
      openBusinessCommandResultWithKey<unknown>(
        ingress.payloadJson,
        {
          commandId: ingress.id,
          idempotencyKey: `provider-ingress:${ingress.ingressKey}`,
          requestHash: ingress.payloadHash,
        },
        key,
      ),
    );
  } finally {
    key.fill(0);
  }
}

async function markTerminal(
  context: ServiceContext,
  row: MediaIntentRow,
  code: string,
): Promise<void> {
  const updated = await context.prisma.outboxIntent.updateMany({
    where: { id: row.id, status: "processing", leaseToken: row.leaseToken },
    data: {
      status: "dead_letter",
      outcomeState: "none",
      lastErrorCode: code.slice(0, 128),
      deadLetteredAt: new Date(),
      nextAttemptAt: null,
      lockedAt: null,
      leaseToken: null,
    },
  });
  if (updated.count !== 1) throw new ConflictError("WhatsApp media fetch lease changed before terminal commit");
}

async function markRetry(
  context: ServiceContext,
  row: MediaIntentRow,
  code: string,
): Promise<void> {
  if (row.attemptCount >= MAX_ATTEMPTS) return markTerminal(context, row, code);
  const now = new Date();
  const updated = await context.prisma.outboxIntent.updateMany({
    where: { id: row.id, status: "processing", leaseToken: row.leaseToken },
    data: {
      status: "retrying",
      outcomeState: "none",
      lastErrorCode: code.slice(0, 128),
      nextAttemptAt: new Date(now.getTime() + retryDelay(row.attemptCount)),
      lockedAt: null,
      leaseToken: null,
    },
  });
  if (updated.count !== 1) throw new ConflictError("WhatsApp media fetch lease changed before retry commit");
}

function failureDisposition(error: unknown): { retryable: boolean; code: string } {
  if (error instanceof WhatsAppMediaObjectError) {
    return {
      retryable: error.code === "MEDIA_OBJECT_IO_FAILED",
      code: error.code,
    };
  }
  if (error instanceof SidecarRequestError) {
    return { retryable: error.retryable, code: error.code };
  }
  if (error instanceof SidecarUnavailableError) {
    return { retryable: true, code: "WHATSAPP_SIDECAR_UNAVAILABLE" };
  }
  if (error instanceof z.ZodError) {
    return { retryable: false, code: "MEDIA_FETCH_CANONICAL_PAYLOAD_INVALID" };
  }
  return { retryable: true, code: "MEDIA_FETCH_FAILED" };
}

async function markSucceeded(
  context: ServiceContext,
  row: MediaIntentRow,
  messageId: string,
  kind: WhatsAppBinaryMediaKind,
  receipt: WhatsAppMediaObjectReceipt,
): Promise<void> {
  await verifyWhatsAppMediaObject(context, messageId, kind, receipt);
  const objectFile = resolve(
    whatsAppMediaRoot(context),
    `${receipt.objectId}.sfmedia`,
  );
  const ciphertext = readFileSync(objectFile);
  const objectCiphertextSha256 = createHash("sha256")
    .update(ciphertext)
    .digest("hex");
  const objectCiphertextBytes = ciphertext.length;
  ciphertext.fill(0);
  // Bracket the provenance read with full GCM verification so the audit binds
  // one exact ciphertext representation that was authenticated against the
  // canonical message/object identity. Any later corruption or replacement
  // changes this digest and is rejected by native backup certification.
  await verifyWhatsAppMediaObject(context, messageId, kind, receipt);

  const key = await getBusinessEnvelopeKey(context);
  let protectedReceipt: string;
  try {
    protectedReceipt = sealBusinessPayloadWithKey(
      receipt,
      {
        kind: "outbox-intent-receipt",
        recordKey: row.effectKey,
        recordType: row.effectType,
        commandId: row.commandId,
      },
      key,
    );
  } finally {
    key.fill(0);
  }
  const updated = await context.prisma.$transaction(async (tx) => {
    const marked = await tx.outboxIntent.updateMany({
      where: { id: row.id, status: "processing", leaseToken: row.leaseToken },
      data: {
        status: "succeeded",
        outcomeState: "receipt",
        receiptJson: protectedReceipt,
        succeededAt: new Date(),
        nextAttemptAt: null,
        lockedAt: null,
        leaseToken: null,
        lastErrorCode: null,
      },
    });
    if (marked.count !== 1) return false;
    await tx.auditLog.create({
      data: {
        action: "whatsapp.media.fetch_succeeded",
        entity: "message",
        entityId: messageId,
        actor: "system:whatsapp-media",
        metadata: JSON.stringify({
          effectKey: row.effectKey,
          mediaKind: kind,
          objectId: receipt.objectId,
          objectCiphertextSha256,
          objectCiphertextBytes,
          sizeBytes: receipt.sizeBytes,
        }),
      },
    });
    return true;
  });
  if (!updated) throw new ConflictError("WhatsApp media fetch lease changed before success commit");
}

async function executeClaimed(
  context: ServiceContext,
  row: MediaIntentRow,
  downloader: WhatsAppMediaDownloader,
): Promise<void> {
  try {
    const payload = await openIntentPayload(context, row);
    if (payload.messageId !== payload.ingressEventId) {
      return markTerminal(context, row, "MEDIA_FETCH_IDENTITY_MISMATCH");
    }
    const [envelope, message] = await Promise.all([
      openIngressEnvelope(context, payload.ingressEventId),
      context.prisma.message.findUnique({
        where: { id: payload.messageId },
        select: { attachments: true },
      }),
    ]);
    const attachment = message
      ? await openWhatsAppMessageAttachment(
          context,
          payload.messageId,
          message.attachments,
        )
      : null;
    const kind = binaryKind(attachment);
    if (!kind || !attachment || attachment.state === "rejected") {
      return markTerminal(context, row, "MEDIA_ATTACHMENT_NOT_FETCHABLE");
    }
    const response = await downloader(envelope.message);
    if (!response.body) {
      return markRetry(context, row, "WHATSAPP_MEDIA_EMPTY_RESPONSE");
    }
    const receipt = await writeWhatsAppMediaObject(context, {
      messageId: payload.messageId,
      kind,
      declaredSize: attachment.sizeBytes,
      declaredMime: attachment.mimeType,
      source: response.body,
    });
    await markSucceeded(context, row, payload.messageId, kind, receipt);
  } catch (error) {
    const disposition = failureDisposition(error);
    if (disposition.retryable) await markRetry(context, row, disposition.code);
    else await markTerminal(context, row, disposition.code);
  }
}

export async function drainDueWhatsAppMediaFetches(
  context: ServiceContext,
  limit = 4,
  downloader: WhatsAppMediaDownloader = sidecar.downloadMedia,
): Promise<number> {
  const bounded = Math.max(1, Math.min(limit, 12));
  let processed = 0;
  for (; processed < bounded; processed += 1) {
    const row = await claimMediaIntent(context);
    if (!row) break;
    await executeClaimed(context, row, downloader);
  }
  return processed;
}
