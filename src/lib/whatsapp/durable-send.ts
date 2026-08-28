import "server-only";

import { randomUUID } from "node:crypto";
import { parseWebStream } from "music-metadata";
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
import { sealWhatsAppMessageAttachmentWithKey } from "./message-attachments";
import { readWhatsAppMediaObject } from "./media-object-provenance";
import {
  WhatsAppMediaObjectError,
  type WhatsAppMediaObjectReceipt,
  removeWhatsAppMediaObject,
  writeWhatsAppMediaObject,
} from "./media-object-store";
import { normalizeWhatsAppJid } from "./types";

export const WHATSAPP_TEXT_EFFECT_TYPE = "whatsapp.text.send.v1";
export const WHATSAPP_IMAGE_EFFECT_TYPE = "whatsapp.image.send.v1";
export const WHATSAPP_VIDEO_EFFECT_TYPE = "whatsapp.video.send.v1";
export const WHATSAPP_DOCUMENT_EFFECT_TYPE = "whatsapp.document.send.v1";
export const WHATSAPP_VOICE_EFFECT_TYPE = "whatsapp.voice.send.v1";
const MAX_ATTEMPTS = 6;
const TEXT_LEASE_MS = 90_000;
// Image dispatch has a 120-second sidecar timeout. Keep recovery outside that
// active provider window so a second worker cannot reclaim an in-flight send.
const IMAGE_LEASE_MS = 150_000;
// Video dispatch has a 180-second sidecar timeout. As with image effects, the
// recovery lease must remain outside the active provider window.
const VIDEO_LEASE_MS = 210_000;
// Document dispatch shares the video provider window: both allow up to 64 MiB
// of authenticated bytes to upload before the receipt is expected.
const DOCUMENT_LEASE_MS = 210_000;
// Voice dispatch shares the same recovery window. The 32 MiB audio ceiling is
// smaller than video, but the lease must stay outside the active provider call
// so a crashed dispatch can never double-send a voice note.
const VOICE_LEASE_MS = 210_000;
const RETRY_DELAYS_MS = [5_000, 30_000, 120_000, 600_000, 1_800_000] as const;
const RECONCILIATION_DEFERRED = "RECEIPT_RECONCILIATION_DEFERRED";

const mediaReceiptBaseSchema = z.object({
  formatVersion: z.literal(1),
  objectId: z.string().regex(/^[0-9a-f]{64}$/),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  sizeBytes: z.number().int().positive().safe(),
  chunkCount: z.number().int().positive().safe(),
});

const imageMediaReceiptSchema = mediaReceiptBaseSchema.extend({
  mediaType: z.enum(["image/jpeg", "image/png", "image/webp"]),
});

const videoMediaReceiptSchema = mediaReceiptBaseSchema.extend({
  mediaType: z.literal("video/mp4"),
});

// Receipt media types are the sniffed classifications from the encrypted
// storage authority, not browser declarations: OOXML/legacy-Office containers
// arrive as zip/OLE storage and text/csv arrives as text/plain.
const documentMediaReceiptSchema = mediaReceiptBaseSchema.extend({
  mediaType: z.enum([
    "application/pdf",
    "application/zip",
    "application/x-ole-storage",
    "text/plain",
  ]),
});

// Voice receipts keep the sniffed audio classifications that can be
// metadata-authenticated; AMR is never queued because its container cannot
// be verified. OGG is the only container eligible for the PTT voice-note
// form and only when its codec authenticates as Opus.
const voiceMediaReceiptSchema = mediaReceiptBaseSchema.extend({
  mediaType: z.enum([
    "audio/ogg",
    "audio/wav",
    "audio/mpeg",
    "audio/aac",
    "audio/mp4",
  ]),
});

/**
 * Provider-side quoted-reply context (#317). The stanza ID plus sender
 * identity let WhatsApp anchor the quote to the exact provider message, and
 * the single-type stub is only the honest fallback rendered when the
 * recipient's client cannot resolve that message locally.
 */
export const quotedContextSchema = z.object({
  stanzaId: z
    .string()
    .min(8)
    .max(128)
    .regex(/^[A-Za-z0-9+/=_-]+$/),
  fromMe: z.boolean(),
  participant: z
    .string()
    .max(256)
    .regex(/^[^@\s]{1,128}@[A-Za-z0-9.-]{1,120}$/)
    .optional(),
  stubKind: z.enum(["text", "image", "video", "audio", "document"]),
  stubText: z.string().max(2048).optional(),
});

export type WhatsAppQuotedContext = z.infer<typeof quotedContextSchema>;

const queuedTextPayloadSchema = z.object({
  messageId: z.string().uuid(),
  to: z.string().min(1).max(256),
  text: z.string().min(1).max(4000),
  requestBinding: z.string().regex(/^[0-9a-f]{64}$/),
  quoted: quotedContextSchema.optional(),
});

const queuedImagePayloadSchema = z.object({
  messageId: z.string().uuid(),
  to: z.string().min(1).max(256),
  caption: z.string().max(4000),
  fileName: z.string().max(180).nullable(),
  media: imageMediaReceiptSchema,
  requestBinding: z.string().regex(/^[0-9a-f]{64}$/),
  quoted: quotedContextSchema.optional(),
});

const queuedVideoPayloadSchema = z.object({
  messageId: z.string().uuid(),
  to: z.string().min(1).max(256),
  caption: z.string().max(4000),
  fileName: z.string().max(180).nullable(),
  // Null is truthful for a verified video-only container whose movie header
  // does not expose a duration through the authenticated metadata reader.
  durationSeconds: z.number().int().positive().safe().nullable(),
  media: videoMediaReceiptSchema,
  requestBinding: z.string().regex(/^[0-9a-f]{64}$/),
  quoted: quotedContextSchema.optional(),
});

const queuedDocumentPayloadSchema = z.object({
  messageId: z.string().uuid(),
  to: z.string().min(1).max(256),
  caption: z.string().max(4000),
  // Documents always carry a non-empty safe file name: WhatsApp renders it as
  // the recipient-visible document title and the provider call requires it.
  fileName: z.string().min(1).max(180),
  media: documentMediaReceiptSchema,
  requestBinding: z.string().regex(/^[0-9a-f]{64}$/),
  quoted: quotedContextSchema.optional(),
});

const queuedVoicePayloadSchema = z.object({
  messageId: z.string().uuid(),
  to: z.string().min(1).max(256),
  // WhatsApp audio and voice notes carry no caption and no file name; both
  // fields stay out of the bounded contract entirely.
  // Null is truthful when the authenticated container does not expose a
  // positive duration through the metadata reader.
  durationSeconds: z.number().int().positive().safe().nullable(),
  // True only for authenticated OGG/Opus content dispatched as a PTT voice
  // note; every other accepted container is a plain audio attachment.
  voiceMessage: z.boolean(),
  media: voiceMediaReceiptSchema,
  requestBinding: z.string().regex(/^[0-9a-f]{64}$/),
  quoted: quotedContextSchema.optional(),
});

type QueuedTextPayload = z.infer<typeof queuedTextPayloadSchema>;
type QueuedImagePayload = z.infer<typeof queuedImagePayloadSchema>;
type QueuedVideoPayload = z.infer<typeof queuedVideoPayloadSchema>;
type QueuedDocumentPayload = z.infer<typeof queuedDocumentPayloadSchema>;
type QueuedVoicePayload = z.infer<typeof queuedVoicePayloadSchema>;
type QueuedPayload =
  | QueuedTextPayload
  | QueuedImagePayload
  | QueuedVideoPayload
  | QueuedDocumentPayload
  | QueuedVoicePayload;

type TrustedWhatsAppCommandContext = BusinessPrincipalContext & {
  readonly businessPrincipal: TrustedBusinessPrincipal;
};

export interface QueueWhatsAppTextInput {
  clientMessageId: string;
  to: string;
  text: string;
  quotedMessageId?: string | null;
}

export interface QueueWhatsAppImageInput {
  clientMessageId: string;
  to: string;
  caption?: string;
  fileName?: string | null;
  declaredMime: string | null;
  declaredSize: number;
  source: ReadableStream<Uint8Array>;
  quotedMessageId?: string | null;
}

export interface QueueWhatsAppVideoInput {
  clientMessageId: string;
  to: string;
  caption?: string;
  fileName?: string | null;
  declaredMime: string | null;
  declaredSize: number;
  source: ReadableStream<Uint8Array>;
  quotedMessageId?: string | null;
}

export interface QueueWhatsAppDocumentInput {
  clientMessageId: string;
  to: string;
  caption?: string;
  fileName?: string | null;
  declaredMime: string | null;
  declaredSize: number;
  source: ReadableStream<Uint8Array>;
  quotedMessageId?: string | null;
}

export interface QueueWhatsAppVoiceInput {
  clientMessageId: string;
  to: string;
  declaredMime: string | null;
  declaredSize: number;
  source: ReadableStream<Uint8Array>;
  quotedMessageId?: string | null;
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

export interface SendReceipt {
  ok: boolean;
  id: string;
  status: string;
}

export type WhatsAppEffectSender = (
  to: string,
  text: string,
  effectKey: string,
  requestBinding: string,
  quoted: WhatsAppQuotedContext | null,
) => Promise<SendReceipt>;

export type WhatsAppImageEffectSender = (
  to: string,
  image: Buffer,
  mediaType: string,
  caption: string,
  effectKey: string,
  requestBinding: string,
  quoted: WhatsAppQuotedContext | null,
) => Promise<SendReceipt>;

export type WhatsAppVideoEffectSender = (
  to: string,
  video: Buffer,
  mediaType: string,
  caption: string,
  effectKey: string,
  requestBinding: string,
  quoted: WhatsAppQuotedContext | null,
) => Promise<SendReceipt>;

export type WhatsAppDocumentEffectSender = (
  to: string,
  document: Buffer,
  mediaType: string,
  fileName: string,
  caption: string,
  effectKey: string,
  requestBinding: string,
  quoted: WhatsAppQuotedContext | null,
) => Promise<SendReceipt>;

export type WhatsAppVoiceEffectSender = (
  to: string,
  audio: Buffer,
  mediaType: string,
  voiceMessage: boolean,
  durationSeconds: number | null,
  effectKey: string,
  requestBinding: string,
  quoted: WhatsAppQuotedContext | null,
) => Promise<SendReceipt>;

export type WhatsAppEffectReceiptLookup = (
  effectKey: string,
  requestBinding: string,
) => Promise<SendReceipt | null>;

function supportedEffectType(value: string): boolean {
  return (
    value === WHATSAPP_TEXT_EFFECT_TYPE ||
    value === WHATSAPP_IMAGE_EFFECT_TYPE ||
    value === WHATSAPP_VIDEO_EFFECT_TYPE ||
    value === WHATSAPP_DOCUMENT_EFFECT_TYPE ||
    value === WHATSAPP_VOICE_EFFECT_TYPE
  );
}

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
  if (!row || !supportedEffectType(row.effectType)) {
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
    await setMessageDeliveryWithoutDowngrade(
      tx,
      effect.messageId,
      deliveryStatus,
    );
  }
}

async function setMessageDeliveryWithoutDowngrade(
  tx: Parameters<Parameters<ServiceContext["prisma"]["$transaction"]>[0]>[0],
  messageId: string,
  deliveryStatus: string,
): Promise<boolean> {
  const protectedStatuses =
    deliveryStatus === "sending"
      ? ["sent", "delivered", "read"]
      : deliveryStatus === "sent" || deliveryStatus === "failed"
        ? ["delivered", "read"]
        : [];
  const updated = await tx.message.updateMany({
    where: {
      id: messageId,
      ...(protectedStatuses.length
        ? {
            OR: [
              { deliveryStatus: null },
              { deliveryStatus: { notIn: protectedStatuses } },
            ],
          }
        : {}),
    },
    data: { deliveryStatus },
  });
  if (updated.count === 1) return true;

  const existing = await tx.message.findUnique({
    where: { id: messageId },
    select: { id: true },
  });
  return existing !== null;
}

async function openClaimedPayload(
  context: ServiceContext,
  claimed: OutboxRow,
): Promise<QueuedPayload> {
  const envelopeKey = await getBusinessEnvelopeKey(context);
  try {
    const opened = openBusinessPayloadWithKey(
      claimed.payloadJson,
      {
        kind: "outbox-intent",
        recordKey: claimed.effectKey,
        recordType: claimed.effectType,
        commandId: claimed.commandId,
      },
      envelopeKey,
    );
    if (claimed.effectType === WHATSAPP_IMAGE_EFFECT_TYPE) {
      return queuedImagePayloadSchema.parse(opened);
    }
    if (claimed.effectType === WHATSAPP_VIDEO_EFFECT_TYPE) {
      return queuedVideoPayloadSchema.parse(opened);
    }
    if (claimed.effectType === WHATSAPP_DOCUMENT_EFFECT_TYPE) {
      return queuedDocumentPayloadSchema.parse(opened);
    }
    if (claimed.effectType === WHATSAPP_VOICE_EFFECT_TYPE) {
      return queuedVoicePayloadSchema.parse(opened);
    }
    return queuedTextPayloadSchema.parse(opened);
  } finally {
    envelopeKey.fill(0);
  }
}

function normalizeRecipient(input: string): string {
  try {
    return normalizeWhatsAppJid(input);
  } catch {
    throw new SahelFlowError(
      "WhatsApp recipient must be a valid Algerian mobile number or known individual chat",
      "VALIDATION_ERROR",
      400,
    );
  }
}

function safeOutboundFileName(value: string | null | undefined): string | null {
  const candidate = value
    ?.replace(/[\u0000-\u001f\u007f]/g, " ")
    .replaceAll("\\", "/")
    .split("/")
    .at(-1)
    ?.trim();
  return candidate ? candidate.slice(0, 180) : null;
}

function quotedStubKind(messageType: string): WhatsAppQuotedContext["stubKind"] {
  switch (messageType) {
    case "image":
    case "sticker":
      return "image";
    case "video":
      return "video";
    case "audio":
      return "audio";
    case "document":
      return "document";
    default:
      return "text";
  }
}

function quotedStubText(body: string): string | undefined {
  const bounded = Array.from(body).slice(0, 2048).join("");
  return bounded || undefined;
}

const QUOTED_TARGET_ID_PATTERN = /^[A-Za-z0-9_-]{6,96}$/;

const QUOTED_TARGET_SELECT = {
  id: true,
  direction: true,
  body: true,
  messageType: true,
  conversation: { select: { sourceId: true } },
} as const;

type QuotedTargetMessage = {
  id: string;
  direction: string;
  body: string;
  messageType: string;
  conversation: { sourceId: string | null };
};

interface ResolvedQuotedReply {
  context: WhatsAppQuotedContext | null;
  /** Canonical Message.id persisted on the reply row for local quote previews. */
  canonicalTargetId: string | null;
}

/**
 * Canonical target lookup across both id spaces the composer can quote
 * (#317). The inbox projection surfaces messages under their provider stanza
 * IDs (WAMIDs) once WhatsApp provenance exists, so a quote arrives either as
 * the canonical Message id, the applied inbound provider event id of a
 * received message, or the confirmed provider message id of a sent message.
 * Ambiguous provider ids only resolve when exactly one candidate matches the
 * quoting conversation.
 */
async function findQuotedTargetMessage(
  context: TrustedWhatsAppCommandContext,
  id: string,
  jid: string,
): Promise<QuotedTargetMessage | null> {
  const direct = await context.prisma.message.findUnique({
    where: { id },
    select: QUOTED_TARGET_SELECT,
  });
  if (direct) return direct;

  const [inboundEvents, outboundEffects] = await Promise.all([
    context.prisma.providerIngressEvent.findMany({
      where: {
        providerEventId: id,
        status: "applied",
        messageId: { not: null },
      },
      select: { messageId: true },
      take: 5,
    }),
    context.prisma.whatsAppOutboundEffect.findMany({
      where: { providerMessageId: id },
      select: { messageId: true },
      take: 5,
    }),
  ]);
  const candidateIds = [
    ...new Set([
      ...inboundEvents.flatMap((event) =>
        event.messageId ? [event.messageId] : [],
      ),
      ...outboundEffects.map((effect) => effect.messageId),
    ]),
  ];
  if (candidateIds.length === 0) return null;
  const candidates = await context.prisma.message.findMany({
    where: { id: { in: candidateIds } },
    select: QUOTED_TARGET_SELECT,
  });
  const [soleCandidate] = candidates;
  if (candidates.length === 1 && soleCandidate) return soleCandidate;
  return (
    candidates.find((message) => message.conversation.sourceId === jid) ??
    null
  );
}

/**
 * Resolve the provider-side quoted-reply context from a message in the same
 * conversation (#317). Inbound targets anchor to their applied provider
 * ingress event; outbound targets must already carry a confirmed provider
 * message ID, because quoting an intent that WhatsApp has not acknowledged
 * cannot render truthfully on the recipient.
 */
async function resolveQuotedReplyContext(
  context: TrustedWhatsAppCommandContext,
  jid: string,
  quotedMessageId: string | null | undefined,
): Promise<ResolvedQuotedReply> {
  const id = (quotedMessageId ?? "").trim();
  if (!id) return { context: null, canonicalTargetId: null };
  if (!QUOTED_TARGET_ID_PATTERN.test(id)) {
    throw new SahelFlowError(
      "Quoted reply target has an invalid identifier",
      "VALIDATION_ERROR",
      400,
    );
  }
  const target = await findQuotedTargetMessage(context, id, jid);
  if (!target || target.conversation.sourceId !== jid) {
    throw new SahelFlowError(
      "Quoted reply target must be a message in the same conversation",
      "VALIDATION_ERROR",
      400,
    );
  }
  if (
    target.direction === "system" ||
    target.messageType === "activity" ||
    target.messageType === "template"
  ) {
    throw new SahelFlowError(
      "This message kind cannot be quoted",
      "VALIDATION_ERROR",
      400,
    );
  }
  if (target.direction === "inbound") {
    const applied = await context.prisma.providerIngressEvent.findFirst({
      where: { messageId: target.id, status: "applied" },
      select: { providerEventId: true },
    });
    if (!applied?.providerEventId) {
      throw new SahelFlowError(
        "Quoted message has no confirmed WhatsApp provenance yet",
        "CONFLICT",
        409,
      );
    }
    return {
      context: {
        stanzaId: applied.providerEventId,
        fromMe: false,
        participant: jid,
        stubKind: quotedStubKind(target.messageType),
        stubText: quotedStubText(target.body),
      },
      canonicalTargetId: target.id,
    };
  }
  const effect = await context.prisma.whatsAppOutboundEffect.findUnique({
    where: { messageId: target.id },
    select: { providerMessageId: true },
  });
  if (!effect?.providerMessageId) {
    throw new SahelFlowError(
      "Quoted reply target is not yet confirmed by WhatsApp",
      "CONFLICT",
      409,
    );
  }
  return {
    context: {
      stanzaId: effect.providerMessageId,
      fromMe: true,
      stubKind: quotedStubKind(target.messageType),
      stubText: quotedStubText(target.body),
    },
    canonicalTargetId: target.id,
  };
}

export async function queueWhatsAppText(
  context: TrustedWhatsAppCommandContext,
  input: QueueWhatsAppTextInput,
): Promise<{ effectKey: string; messageId: string; replayed: boolean }> {
  const clientMessageId = z.string().uuid().parse(input.clientMessageId);
  const text = z.string().trim().min(1).max(4000).parse(input.text);
  const jid = normalizeRecipient(input.to);
  const quoted = await resolveQuotedReplyContext(context, jid, input.quotedMessageId);

  // The quote target is part of the request identity: two sends that differ
  // only in what they quote must never share one authority or effect key.
  const contentBinding = quoted.context
    ? JSON.stringify({ text, quotedStanzaId: quoted.context.stanzaId })
    : text;
  const { effectKey, requestBinding } = await createWhatsAppEffectAuthority(
    context,
    "text",
    clientMessageId,
    jid,
    contentBinding,
  );
  const phone = jid.slice(0, jid.indexOf("@"));
  const now = new Date();
  const payload = {
    messageId: clientMessageId,
    to: jid,
    text,
    requestBinding,
    ...(quoted.context ? { quoted: quoted.context } : {}),
  } satisfies QueuedTextPayload;

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
      payload,
    },
    async ({ tx }) => {
      const conversationKey = {
        channel_sourceId: { channel: "whatsapp", sourceId: jid },
      } as const;
      const existingConversation = await tx.conversation.findUnique({
        where: conversationKey,
        select: {
          id: true,
          messages: {
            where: { direction: "inbound" },
            select: { id: true },
            take: 1,
          },
        },
      });
      if (
        jid.endsWith("@lid") &&
        (!existingConversation || existingConversation.messages.length === 0)
      ) {
        throw new SahelFlowError(
          "WhatsApp LID replies require persisted inbound message provenance",
          "VALIDATION_ERROR",
          400,
        );
      }
      const conversation = existingConversation
        ? await tx.conversation.update({
            where: conversationKey,
            data: { lastMessageAt: now },
            select: { id: true },
          })
        : await tx.conversation.create({
            data: {
              channel: "whatsapp",
              contactName: phone,
              contactPhone: phone,
              sourceId: jid,
              lastMessageAt: now,
            },
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
          quotedMessageId: quoted.canonicalTargetId,
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
            payload,
          },
        ],
        projectionInvalidations: [`conversation:${conversation.id}`, "inbox"],
      };
    },
  );

  return { ...execution.result, replayed: execution.replayed };
}

/**
 * Best-effort post-stage hygiene. If queueing fails after the encrypted object
 * was staged but before the canonical command committed, the object would be
 * unreachable customer media retained on disk. Removal is skipped whenever a
 * canonical Message already references the object (for example an earlier
 * attempt of the same client message ID committed), so idempotent retries can
 * never destroy reachable media. A genuine retry restages the same bytes.
 */
async function discardStagedMediaIfUnreferenced(
  context: TrustedWhatsAppCommandContext,
  messageId: string,
): Promise<void> {
  try {
    const referenced = await context.prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true },
    });
    if (referenced) return;
    await removeWhatsAppMediaObject(context, messageId);
  } catch {
    // Hygiene must never mask the original queue failure.
  }
}

function stagedMediaGuard(
  context: TrustedWhatsAppCommandContext,
  messageId: string,
): (error: unknown) => Promise<never> {
  return async (error: unknown): Promise<never> => {
    await discardStagedMediaIfUnreferenced(context, messageId);
    throw error;
  };
}

export async function queueWhatsAppImage(
  context: TrustedWhatsAppCommandContext,
  input: QueueWhatsAppImageInput,
): Promise<{ effectKey: string; messageId: string; replayed: boolean }> {
  const clientMessageId = z.string().uuid().parse(input.clientMessageId);
  const caption = z.string().max(4000).parse(input.caption?.trim() ?? "");
  const declaredSize = z.number().int().positive().max(20 * 1024 * 1024).parse(input.declaredSize);
  const declaredMime = z
    .enum(["image/jpeg", "image/png", "image/webp"])
    .parse(input.declaredMime?.split(";", 1)[0]?.trim().toLowerCase());
  const fileName = safeOutboundFileName(input.fileName);
  const jid = normalizeRecipient(input.to);
  // Resolved before staging: an invalid quote must never leave staged media.
  const quoted = await resolveQuotedReplyContext(context, jid, input.quotedMessageId);

  let media: z.infer<typeof imageMediaReceiptSchema>;
  try {
    media = imageMediaReceiptSchema.parse(
      await writeWhatsAppMediaObject(context, {
        messageId: clientMessageId,
        kind: "image",
        declaredSize,
        declaredMime,
        source: input.source,
        strictSourceIdentity: true,
      }),
    );
  } catch (error) {
    if (
      error instanceof WhatsAppMediaObjectError &&
      error.code === "MEDIA_OBJECT_CONFLICT"
    ) {
      throw new ConflictError(
        "This WhatsApp client message ID is already bound to different image content",
      );
    }
    throw error;
  }
  const contentBinding = JSON.stringify({
    caption,
    fileName,
    sha256: media.sha256,
    sizeBytes: media.sizeBytes,
    mediaType: media.mediaType,
    ...(quoted.context
      ? { quotedStanzaId: quoted.context.stanzaId }
      : {}),
  });
  const { effectKey, requestBinding } = await createWhatsAppEffectAuthority(
    context,
    "image",
    clientMessageId,
    jid,
    contentBinding,
  ).catch(stagedMediaGuard(context, clientMessageId));
  const attachmentKey = await getBusinessEnvelopeKey(context);
  let protectedAttachment: string;
  try {
    protectedAttachment = sealWhatsAppMessageAttachmentWithKey(
      clientMessageId,
      {
        formatVersion: 1,
        kind: "image",
        state: "ready",
        mimeType: media.mediaType,
        fileName,
        sizeBytes: media.sizeBytes,
        durationSeconds: null,
        width: null,
        height: null,
        voiceMessage: false,
        location: null,
        contact: null,
        failureCode: null,
      },
      attachmentKey,
    );
  } catch (error) {
    await discardStagedMediaIfUnreferenced(context, clientMessageId);
    throw error;
  } finally {
    attachmentKey.fill(0);
  }

  const phone = jid.slice(0, jid.indexOf("@"));
  const now = new Date();
  const payload = {
    messageId: clientMessageId,
    to: jid,
    caption,
    fileName,
    media,
    requestBinding,
    ...(quoted.context ? { quoted: quoted.context } : {}),
  } satisfies QueuedImagePayload;

  const execution = await executeBusinessCommand(
    context,
    {
      idempotencyKey: effectKey,
      commandType: "whatsapp_image.queue.v1",
      aggregate: {
        type: "whatsapp-message",
        id: clientMessageId,
        expectedVersion: 0,
      },
      actor: context.businessPrincipal.auditActor,
      correlationId: clientMessageId,
      payload,
    },
    async ({ tx }) => {
      const conversationKey = {
        channel_sourceId: { channel: "whatsapp", sourceId: jid },
      } as const;
      const existingConversation = await tx.conversation.findUnique({
        where: conversationKey,
        select: {
          id: true,
          messages: {
            where: { direction: "inbound" },
            select: { id: true },
            take: 1,
          },
        },
      });
      if (
        jid.endsWith("@lid") &&
        (!existingConversation || existingConversation.messages.length === 0)
      ) {
        throw new SahelFlowError(
          "WhatsApp LID replies require persisted inbound message provenance",
          "VALIDATION_ERROR",
          400,
        );
      }
      const conversation = existingConversation
        ? await tx.conversation.update({
            where: conversationKey,
            data: { lastMessageAt: now },
            select: { id: true },
          })
        : await tx.conversation.create({
            data: {
              channel: "whatsapp",
              contactName: phone,
              contactPhone: phone,
              sourceId: jid,
              lastMessageAt: now,
            },
            select: { id: true },
          });
      await tx.message.create({
        data: {
          id: clientMessageId,
          conversationId: conversation.id,
          body: caption,
          direction: "outbound",
          timestamp: now,
          deliveryStatus: "sending",
          messageType: "image",
          quotedMessageId: quoted.canonicalTargetId,
          attachments: protectedAttachment,
        },
      });
      await tx.whatsAppOutboundEffect.create({
        data: { effectKey, messageId: clientMessageId },
      });
      return {
        result: { effectKey, messageId: clientMessageId },
        audit: {
          action: "whatsapp.image.queued",
          entity: "message",
          entityId: clientMessageId,
          metadata: {
            effectKey,
            conversationId: conversation.id,
            mediaType: media.mediaType,
            sizeBytes: media.sizeBytes,
            sha256: media.sha256,
          },
        },
        events: [
          {
            key: `${effectKey}:queued`,
            type: "whatsapp.image.queued.v1",
            payload: { messageId: clientMessageId, conversationId: conversation.id },
          },
        ],
        outbox: [
          {
            effectKey,
            effectType: WHATSAPP_IMAGE_EFFECT_TYPE,
            payload,
          },
        ],
        projectionInvalidations: [`conversation:${conversation.id}`, "inbox"],
      };
    },
  ).catch(stagedMediaGuard(context, clientMessageId));

  return { ...execution.result, replayed: execution.replayed };
}

async function inspectOutboundVideoDuration(
  source: ReadableStream<Uint8Array>,
  declaredSize: number,
): Promise<number | null> {
  let metadata: Awaited<ReturnType<typeof parseWebStream>>;
  try {
    metadata = await parseWebStream(
      source,
      { mimeType: "video/mp4", size: declaredSize },
      { duration: true, skipCovers: true },
    );
  } catch {
    throw new SahelFlowError(
      "WhatsApp video metadata could not be authenticated",
      "VALIDATION_ERROR",
      400,
    );
  }
  // The authenticated container must expose a real video track. This rejects
  // audio-only MP4/M4A content regardless of any declared duration.
  if (metadata.format.hasVideo !== true) {
    throw new SahelFlowError(
      "WhatsApp videos must contain a video track",
      "VALIDATION_ERROR",
      400,
    );
  }
  // The MP4 reader derives format.duration from audio tracks only, so a valid
  // silent video-only recording may not expose one. Null stays truthful for
  // that exact case; a present duration must still authenticate as positive.
  const duration = metadata.format.duration;
  if (duration === undefined) return null;
  const rounded = Math.ceil(duration);
  if (!Number.isSafeInteger(rounded) || rounded <= 0) {
    throw new SahelFlowError(
      "WhatsApp videos must have a verified positive duration",
      "VALIDATION_ERROR",
      400,
    );
  }
  return rounded;
}

export async function queueWhatsAppVideo(
  context: TrustedWhatsAppCommandContext,
  input: QueueWhatsAppVideoInput,
): Promise<{ effectKey: string; messageId: string; replayed: boolean }> {
  const clientMessageId = z.string().uuid().parse(input.clientMessageId);
  const caption = z.string().max(4000).parse(input.caption?.trim() ?? "");
  const declaredSize = z.number().int().positive().max(64 * 1024 * 1024).parse(input.declaredSize);
  const declaredMime = z.literal("video/mp4").parse(
    input.declaredMime?.split(";", 1)[0]?.trim().toLowerCase(),
  );
  const fileName = safeOutboundFileName(input.fileName);
  const jid = normalizeRecipient(input.to);
  // Resolved before staging: an invalid quote must never leave staged media.
  const quoted = await resolveQuotedReplyContext(context, jid, input.quotedMessageId);

  // Parse duration from the same bounded byte stream that will be encrypted.
  // The storage branch is not consumed until metadata succeeds, so rejected
  // videos cannot leave an unowned staged object.
  const [metadataSource, storageSource] = input.source.tee();
  let durationSeconds: number | null;
  try {
    durationSeconds = await inspectOutboundVideoDuration(metadataSource, declaredSize);
  } catch (error) {
    await Promise.allSettled([
      metadataSource.cancel(),
      storageSource.cancel(),
    ]);
    throw error;
  }

  let media: z.infer<typeof videoMediaReceiptSchema>;
  try {
    media = videoMediaReceiptSchema.parse(
      await writeWhatsAppMediaObject(context, {
        messageId: clientMessageId,
        kind: "video",
        declaredSize,
        declaredMime,
        source: storageSource,
        strictSourceIdentity: true,
      }),
    );
  } catch (error) {
    if (
      error instanceof WhatsAppMediaObjectError &&
      error.code === "MEDIA_OBJECT_CONFLICT"
    ) {
      throw new ConflictError(
        "This WhatsApp client message ID is already bound to different video content",
      );
    }
    throw error;
  }

  const contentBinding = JSON.stringify({
    caption,
    fileName,
    durationSeconds,
    sha256: media.sha256,
    sizeBytes: media.sizeBytes,
    mediaType: media.mediaType,
    ...(quoted.context
      ? { quotedStanzaId: quoted.context.stanzaId }
      : {}),
  });
  const { effectKey, requestBinding } = await createWhatsAppEffectAuthority(
    context,
    "video",
    clientMessageId,
    jid,
    contentBinding,
  ).catch(stagedMediaGuard(context, clientMessageId));
  const attachmentKey = await getBusinessEnvelopeKey(context);
  let protectedAttachment: string;
  try {
    protectedAttachment = sealWhatsAppMessageAttachmentWithKey(
      clientMessageId,
      {
        formatVersion: 1,
        kind: "video",
        state: "ready",
        mimeType: media.mediaType,
        fileName,
        sizeBytes: media.sizeBytes,
        durationSeconds,
        width: null,
        height: null,
        voiceMessage: false,
        location: null,
        contact: null,
        failureCode: null,
      },
      attachmentKey,
    );
  } catch (error) {
    await discardStagedMediaIfUnreferenced(context, clientMessageId);
    throw error;
  } finally {
    attachmentKey.fill(0);
  }

  const phone = jid.slice(0, jid.indexOf("@"));
  const now = new Date();
  const payload = {
    messageId: clientMessageId,
    to: jid,
    caption,
    fileName,
    durationSeconds,
    media,
    requestBinding,
    ...(quoted.context ? { quoted: quoted.context } : {}),
  } satisfies QueuedVideoPayload;

  const execution = await executeBusinessCommand(
    context,
    {
      idempotencyKey: effectKey,
      commandType: "whatsapp_video.queue.v1",
      aggregate: {
        type: "whatsapp-message",
        id: clientMessageId,
        expectedVersion: 0,
      },
      actor: context.businessPrincipal.auditActor,
      correlationId: clientMessageId,
      payload,
    },
    async ({ tx }) => {
      const conversationKey = {
        channel_sourceId: { channel: "whatsapp", sourceId: jid },
      } as const;
      const existingConversation = await tx.conversation.findUnique({
        where: conversationKey,
        select: {
          id: true,
          messages: {
            where: { direction: "inbound" },
            select: { id: true },
            take: 1,
          },
        },
      });
      if (
        jid.endsWith("@lid") &&
        (!existingConversation || existingConversation.messages.length === 0)
      ) {
        throw new SahelFlowError(
          "WhatsApp LID replies require persisted inbound message provenance",
          "VALIDATION_ERROR",
          400,
        );
      }
      const conversation = existingConversation
        ? await tx.conversation.update({
            where: conversationKey,
            data: { lastMessageAt: now },
            select: { id: true },
          })
        : await tx.conversation.create({
            data: {
              channel: "whatsapp",
              contactName: phone,
              contactPhone: phone,
              sourceId: jid,
              lastMessageAt: now,
            },
            select: { id: true },
          });
      await tx.message.create({
        data: {
          id: clientMessageId,
          conversationId: conversation.id,
          body: caption,
          direction: "outbound",
          timestamp: now,
          deliveryStatus: "sending",
          messageType: "video",
          quotedMessageId: quoted.canonicalTargetId,
          attachments: protectedAttachment,
        },
      });
      await tx.whatsAppOutboundEffect.create({
        data: { effectKey, messageId: clientMessageId },
      });
      return {
        result: { effectKey, messageId: clientMessageId },
        audit: {
          action: "whatsapp.video.queued",
          entity: "message",
          entityId: clientMessageId,
          metadata: {
            effectKey,
            conversationId: conversation.id,
            mediaType: media.mediaType,
            sizeBytes: media.sizeBytes,
            durationSeconds,
            sha256: media.sha256,
          },
        },
        events: [
          {
            key: `${effectKey}:queued`,
            type: "whatsapp.video.queued.v1",
            payload: { messageId: clientMessageId, conversationId: conversation.id },
          },
        ],
        outbox: [
          {
            effectKey,
            effectType: WHATSAPP_VIDEO_EFFECT_TYPE,
            payload,
          },
        ],
        projectionInvalidations: [`conversation:${conversation.id}`, "inbox"],
      };
    },
  ).catch(stagedMediaGuard(context, clientMessageId));

  return { ...execution.result, replayed: execution.replayed };
}

function documentFallbackName(mediaType: string): string {
  switch (mediaType) {
    case "application/pdf":
      return "document.pdf";
    case "application/zip":
      return "document.docx";
    case "application/x-ole-storage":
      return "document.doc";
    default:
      return "document.txt";
  }
}

export async function queueWhatsAppDocument(
  context: TrustedWhatsAppCommandContext,
  input: QueueWhatsAppDocumentInput,
): Promise<{ effectKey: string; messageId: string; replayed: boolean }> {
  const clientMessageId = z.string().uuid().parse(input.clientMessageId);
  const caption = z.string().max(4000).parse(input.caption?.trim() ?? "");
  const declaredSize = z.number().int().positive().max(64 * 1024 * 1024).parse(input.declaredSize);
  const declaredMime = z
    .enum([
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "text/plain",
      "text/csv",
    ])
    .parse(input.declaredMime?.split(";", 1)[0]?.trim().toLowerCase());
  const fileName = safeOutboundFileName(input.fileName);
  const jid = normalizeRecipient(input.to);
  // Resolved before staging: an invalid quote must never leave staged media.
  const quoted = await resolveQuotedReplyContext(context, jid, input.quotedMessageId);

  let media: z.infer<typeof documentMediaReceiptSchema>;
  try {
    media = documentMediaReceiptSchema.parse(
      await writeWhatsAppMediaObject(context, {
        messageId: clientMessageId,
        kind: "document",
        declaredSize,
        declaredMime,
        source: input.source,
        strictSourceIdentity: true,
      }),
    );
  } catch (error) {
    if (
      error instanceof WhatsAppMediaObjectError &&
      error.code === "MEDIA_OBJECT_CONFLICT"
    ) {
      throw new ConflictError(
        "This WhatsApp client message ID is already bound to different document content",
      );
    }
    throw error;
  }
  // Documents are presented to the recipient by name; a missing or generic
  // browser name falls back to the authenticated content classification.
  const outboundFileName = fileName ?? documentFallbackName(media.mediaType);

  const contentBinding = JSON.stringify({
    caption,
    fileName: outboundFileName,
    sha256: media.sha256,
    sizeBytes: media.sizeBytes,
    mediaType: media.mediaType,
    ...(quoted.context
      ? { quotedStanzaId: quoted.context.stanzaId }
      : {}),
  });
  const { effectKey, requestBinding } = await createWhatsAppEffectAuthority(
    context,
    "document",
    clientMessageId,
    jid,
    contentBinding,
  ).catch(stagedMediaGuard(context, clientMessageId));
  const attachmentKey = await getBusinessEnvelopeKey(context);
  let protectedAttachment: string;
  try {
    protectedAttachment = sealWhatsAppMessageAttachmentWithKey(
      clientMessageId,
      {
        formatVersion: 1,
        kind: "document",
        state: "ready",
        mimeType: media.mediaType,
        fileName: outboundFileName,
        sizeBytes: media.sizeBytes,
        durationSeconds: null,
        width: null,
        height: null,
        voiceMessage: false,
        location: null,
        contact: null,
        failureCode: null,
      },
      attachmentKey,
    );
  } catch (error) {
    await discardStagedMediaIfUnreferenced(context, clientMessageId);
    throw error;
  } finally {
    attachmentKey.fill(0);
  }

  const phone = jid.slice(0, jid.indexOf("@"));
  const now = new Date();
  const payload = {
    messageId: clientMessageId,
    to: jid,
    caption,
    fileName: outboundFileName,
    media,
    requestBinding,
    ...(quoted.context ? { quoted: quoted.context } : {}),
  } satisfies QueuedDocumentPayload;

  const execution = await executeBusinessCommand(
    context,
    {
      idempotencyKey: effectKey,
      commandType: "whatsapp_document.queue.v1",
      aggregate: {
        type: "whatsapp-message",
        id: clientMessageId,
        expectedVersion: 0,
      },
      actor: context.businessPrincipal.auditActor,
      correlationId: clientMessageId,
      payload,
    },
    async ({ tx }) => {
      const conversationKey = {
        channel_sourceId: { channel: "whatsapp", sourceId: jid },
      } as const;
      const existingConversation = await tx.conversation.findUnique({
        where: conversationKey,
        select: {
          id: true,
          messages: {
            where: { direction: "inbound" },
            select: { id: true },
            take: 1,
          },
        },
      });
      if (
        jid.endsWith("@lid") &&
        (!existingConversation || existingConversation.messages.length === 0)
      ) {
        throw new SahelFlowError(
          "WhatsApp LID replies require persisted inbound message provenance",
          "VALIDATION_ERROR",
          400,
        );
      }
      const conversation = existingConversation
        ? await tx.conversation.update({
            where: conversationKey,
            data: { lastMessageAt: now },
            select: { id: true },
          })
        : await tx.conversation.create({
            data: {
              channel: "whatsapp",
              contactName: phone,
              contactPhone: phone,
              sourceId: jid,
              lastMessageAt: now,
            },
            select: { id: true },
          });
      await tx.message.create({
        data: {
          id: clientMessageId,
          conversationId: conversation.id,
          body: caption,
          direction: "outbound",
          timestamp: now,
          deliveryStatus: "sending",
          messageType: "document",
          quotedMessageId: quoted.canonicalTargetId,
          attachments: protectedAttachment,
        },
      });
      await tx.whatsAppOutboundEffect.create({
        data: { effectKey, messageId: clientMessageId },
      });
      return {
        result: { effectKey, messageId: clientMessageId },
        audit: {
          action: "whatsapp.document.queued",
          entity: "message",
          entityId: clientMessageId,
          metadata: {
            effectKey,
            conversationId: conversation.id,
            mediaType: media.mediaType,
            sizeBytes: media.sizeBytes,
            fileName: outboundFileName,
            sha256: media.sha256,
          },
        },
        events: [
          {
            key: `${effectKey}:queued`,
            type: "whatsapp.document.queued.v1",
            payload: { messageId: clientMessageId, conversationId: conversation.id },
          },
        ],
        outbox: [
          {
            effectKey,
            effectType: WHATSAPP_DOCUMENT_EFFECT_TYPE,
            payload,
          },
        ],
        projectionInvalidations: [`conversation:${conversation.id}`, "inbox"],
      };
    },
  ).catch(stagedMediaGuard(context, clientMessageId));

  return { ...execution.result, replayed: execution.replayed };
}

interface OutboundVoiceMetadata {
  durationSeconds: number | null;
  voiceMessage: boolean;
}

/**
 * Authenticate the audio container from the same bounded byte stream that will
 * be encrypted. A voice note (PTT) is only ever authenticated OGG/Opus; OGG
 * with any other codec is rejected because WhatsApp clients would render it as
 * a broken voice note. Non-OGG containers are sent as plain audio attachments.
 */
async function inspectOutboundVoiceMetadata(
  source: ReadableStream<Uint8Array>,
  declaredSize: number,
): Promise<OutboundVoiceMetadata> {
  let metadata: Awaited<ReturnType<typeof parseWebStream>>;
  try {
    metadata = await parseWebStream(
      source,
      { size: declaredSize },
      { duration: true, skipCovers: true },
    );
  } catch {
    throw new SahelFlowError(
      "WhatsApp audio metadata could not be authenticated",
      "VALIDATION_ERROR",
      400,
    );
  }
  const container = metadata.format.container?.toLowerCase() ?? "";
  const codec = metadata.format.codec?.toLowerCase() ?? "";
  // Mirror of the video gate: MP4 files that actually contain a video track
  // are refused so video content can never masquerade as an audio attachment.
  if (metadata.format.hasVideo === true) {
    throw new SahelFlowError(
      "WhatsApp audio must not contain a video track",
      "VALIDATION_ERROR",
      400,
    );
  }
  if (container.includes("ogg")) {
    if (!codec.includes("opus")) {
      throw new SahelFlowError(
        "WhatsApp voice notes must contain Opus audio",
        "VALIDATION_ERROR",
        400,
      );
    }
  } else if (!container) {
    // The metadata reader authenticates every accepted container; an
    // unrecognized stream is refused before any staged object exists.
    throw new SahelFlowError(
      "WhatsApp audio could not be authenticated",
      "VALIDATION_ERROR",
      400,
    );
  }
  const duration = metadata.format.duration;
  if (duration === undefined) return { durationSeconds: null, voiceMessage: false };
  const rounded = Math.ceil(duration);
  if (!Number.isSafeInteger(rounded) || rounded <= 0) {
    throw new SahelFlowError(
      "WhatsApp audio must have a verified positive duration",
      "VALIDATION_ERROR",
      400,
    );
  }
  return {
    durationSeconds: rounded,
    voiceMessage: container.includes("ogg") && codec.includes("opus"),
  };
}

export async function queueWhatsAppVoice(
  context: TrustedWhatsAppCommandContext,
  input: QueueWhatsAppVoiceInput,
): Promise<{ effectKey: string; messageId: string; replayed: boolean }> {
  const clientMessageId = z.string().uuid().parse(input.clientMessageId);
  const declaredSize = z
    .number()
    .int()
    .positive()
    .max(32 * 1024 * 1024)
    .parse(input.declaredSize);
  const declaredMime = z
    .enum([
      "audio/ogg",
      "audio/opus",
      "audio/mpeg",
      "audio/mp4",
      "audio/aac",
      "audio/wav",
      "audio/x-wav",
    ])
    .parse(input.declaredMime?.split(";", 1)[0]?.trim().toLowerCase() ?? null);
  const jid = normalizeRecipient(input.to);
  // Resolved before staging: an invalid quote must never leave staged media.
  const quoted = await resolveQuotedReplyContext(context, jid, input.quotedMessageId);

  // Parse metadata from the same bounded byte stream that will be encrypted.
  // The storage branch is not consumed until metadata succeeds, so rejected
  // audio cannot leave an unowned staged object.
  const [metadataSource, storageSource] = input.source.tee();
  let outboundMetadata: OutboundVoiceMetadata;
  try {
    outboundMetadata = await inspectOutboundVoiceMetadata(
      metadataSource,
      declaredSize,
    );
  } catch (error) {
    await Promise.allSettled([
      metadataSource.cancel(),
      storageSource.cancel(),
    ]);
    throw error;
  }

  let media: z.infer<typeof voiceMediaReceiptSchema>;
  try {
    media = voiceMediaReceiptSchema.parse(
      await writeWhatsAppMediaObject(context, {
        messageId: clientMessageId,
        kind: "audio",
        declaredSize,
        declaredMime,
        source: storageSource,
        strictSourceIdentity: true,
      }),
    );
  } catch (error) {
    if (
      error instanceof WhatsAppMediaObjectError &&
      error.code === "MEDIA_OBJECT_CONFLICT"
    ) {
      throw new ConflictError(
        "This WhatsApp client message ID is already bound to different audio content",
      );
    }
    throw error;
  }

  const contentBinding = JSON.stringify({
    durationSeconds: outboundMetadata.durationSeconds,
    voiceMessage: outboundMetadata.voiceMessage,
    sha256: media.sha256,
    sizeBytes: media.sizeBytes,
    mediaType: media.mediaType,
    ...(quoted.context
      ? { quotedStanzaId: quoted.context.stanzaId }
      : {}),
  });
  const { effectKey, requestBinding } = await createWhatsAppEffectAuthority(
    context,
    "voice",
    clientMessageId,
    jid,
    contentBinding,
  ).catch(stagedMediaGuard(context, clientMessageId));
  const attachmentKey = await getBusinessEnvelopeKey(context);
  let protectedAttachment: string;
  try {
    protectedAttachment = sealWhatsAppMessageAttachmentWithKey(
      clientMessageId,
      {
        formatVersion: 1,
        kind: "audio",
        state: "ready",
        mimeType: media.mediaType,
        fileName: null,
        sizeBytes: media.sizeBytes,
        durationSeconds: outboundMetadata.durationSeconds,
        width: null,
        height: null,
        voiceMessage: outboundMetadata.voiceMessage,
        location: null,
        contact: null,
        failureCode: null,
      },
      attachmentKey,
    );
  } catch (error) {
    await discardStagedMediaIfUnreferenced(context, clientMessageId);
    throw error;
  } finally {
    attachmentKey.fill(0);
  }

  const phone = jid.slice(0, jid.indexOf("@"));
  const now = new Date();
  const payload = {
    messageId: clientMessageId,
    to: jid,
    durationSeconds: outboundMetadata.durationSeconds,
    voiceMessage: outboundMetadata.voiceMessage,
    media,
    requestBinding,
    ...(quoted.context ? { quoted: quoted.context } : {}),
  } satisfies QueuedVoicePayload;

  const execution = await executeBusinessCommand(
    context,
    {
      idempotencyKey: effectKey,
      commandType: "whatsapp_voice.queue.v1",
      aggregate: {
        type: "whatsapp-message",
        id: clientMessageId,
        expectedVersion: 0,
      },
      actor: context.businessPrincipal.auditActor,
      correlationId: clientMessageId,
      payload,
    },
    async ({ tx }) => {
      const conversationKey = {
        channel_sourceId: { channel: "whatsapp", sourceId: jid },
      } as const;
      const existingConversation = await tx.conversation.findUnique({
        where: conversationKey,
        select: {
          id: true,
          messages: {
            where: { direction: "inbound" },
            select: { id: true },
            take: 1,
          },
        },
      });
      if (
        jid.endsWith("@lid") &&
        (!existingConversation || existingConversation.messages.length === 0)
      ) {
        throw new SahelFlowError(
          "WhatsApp LID replies require persisted inbound message provenance",
          "VALIDATION_ERROR",
          400,
        );
      }
      const conversation = existingConversation
        ? await tx.conversation.update({
            where: conversationKey,
            data: { lastMessageAt: now },
            select: { id: true },
          })
        : await tx.conversation.create({
            data: {
              channel: "whatsapp",
              contactName: phone,
              contactPhone: phone,
              sourceId: jid,
              lastMessageAt: now,
            },
            select: { id: true },
          });
      await tx.message.create({
        data: {
          id: clientMessageId,
          conversationId: conversation.id,
          body: "",
          direction: "outbound",
          timestamp: now,
          deliveryStatus: "sending",
          messageType: "audio",
          quotedMessageId: quoted.canonicalTargetId,
          attachments: protectedAttachment,
        },
      });
      await tx.whatsAppOutboundEffect.create({
        data: { effectKey, messageId: clientMessageId },
      });
      return {
        result: { effectKey, messageId: clientMessageId },
        audit: {
          action: "whatsapp.voice.queued",
          entity: "message",
          entityId: clientMessageId,
          metadata: {
            effectKey,
            conversationId: conversation.id,
            mediaType: media.mediaType,
            sizeBytes: media.sizeBytes,
            voiceMessage: outboundMetadata.voiceMessage,
            sha256: media.sha256,
          },
        },
        events: [
          {
            key: `${effectKey}:queued`,
            type: "whatsapp.voice.queued.v1",
            payload: { messageId: clientMessageId, conversationId: conversation.id },
          },
        ],
        outbox: [
          {
            effectKey,
            effectType: WHATSAPP_VOICE_EFFECT_TYPE,
            payload,
          },
        ],
        projectionInvalidations: [`conversation:${conversation.id}`, "inbox"],
      };
    },
  ).catch(stagedMediaGuard(context, clientMessageId));

  return { ...execution.result, replayed: execution.replayed };
}

async function recoverPreEffectLease(
  context: ServiceContext,
  row: OutboxRow,
  now: Date,
): Promise<void> {
  await context.prisma.$transaction(async (tx) => {
    const recovered = await tx.outboxIntent.updateMany({
      where: {
        id: row.id,
        status: "processing",
        leaseToken: row.leaseToken,
        effectStartedAt: null,
      },
      data: {
        status: "retrying",
        attemptCount: { decrement: 1 },
        nextAttemptAt: now,
        lockedAt: null,
        leaseToken: null,
        lastErrorCode: "WORKER_LEASE_RECOVERED_BEFORE_EFFECT",
        outcomeState: "none",
        deadLetteredAt: null,
      },
    });
    if (recovered.count !== 1) return;
    await tx.auditLog.create({
      data: {
        action: "whatsapp.message.lease_recovered_before_effect",
        entity: "outbox-intent",
        entityId: row.id,
        actor: "system:whatsapp-outbox",
        metadata: JSON.stringify({
          effectKey: row.effectKey,
          providerCallStarted: false,
        }),
      },
    });
  });
}

async function markExpiredLeaseAmbiguous(
  context: ServiceContext,
  row: OutboxRow,
  errorCode: string,
): Promise<void> {
  await context.prisma.$transaction(async (tx) => {
    const marked = await tx.outboxIntent.updateMany({
      where: {
        id: row.id,
        status: "processing",
        leaseToken: row.leaseToken,
      },
      data: {
        status: "failed",
        outcomeState: "ambiguous",
        lastErrorCode: errorCode,
        nextAttemptAt: null,
        lockedAt: null,
        leaseToken: null,
      },
    });
    if (marked.count !== 1) return;
    await setMessageDeliveryByEffect(tx, row.effectKey, "failed");
    await tx.auditLog.create({
      data: {
        action: "whatsapp.message.outcome_ambiguous",
        entity: "outbox-intent",
        entityId: row.id,
        actor: "system:whatsapp-outbox",
        metadata: JSON.stringify({ effectKey: row.effectKey, errorCode }),
      },
    });
  });
}

async function deferReceiptReconciliation(
  context: ServiceContext,
  row: OutboxRow,
  now: Date,
): Promise<void> {
  await context.prisma.$transaction(async (tx) => {
    const deferred = await tx.outboxIntent.updateMany({
      where: {
        id: row.id,
        status: "processing",
        leaseToken: row.leaseToken,
      },
      data: {
        lockedAt: now,
        lastErrorCode: RECONCILIATION_DEFERRED,
      },
    });
    if (deferred.count !== 1 || row.lastErrorCode === RECONCILIATION_DEFERRED) return;
    await tx.auditLog.create({
      data: {
        action: "whatsapp.message.receipt_reconciliation_deferred",
        entity: "outbox-intent",
        entityId: row.id,
        actor: "system:whatsapp-outbox",
        metadata: JSON.stringify({ effectKey: row.effectKey }),
      },
    });
  });
}

async function recoverExpiredLeases(
  context: ServiceContext,
  now = new Date(),
  receiptLookup: WhatsAppEffectReceiptLookup = sidecar.receipt,
): Promise<void> {
  const expired = (await context.prisma.outboxIntent.findMany({
    where: {
      status: "processing",
      OR: [
        {
          effectType: WHATSAPP_TEXT_EFFECT_TYPE,
          lockedAt: { lt: new Date(now.getTime() - TEXT_LEASE_MS) },
        },
        {
          effectType: WHATSAPP_IMAGE_EFFECT_TYPE,
          lockedAt: { lt: new Date(now.getTime() - IMAGE_LEASE_MS) },
        },
        {
          effectType: WHATSAPP_VIDEO_EFFECT_TYPE,
          lockedAt: { lt: new Date(now.getTime() - VIDEO_LEASE_MS) },
        },
        {
          effectType: WHATSAPP_DOCUMENT_EFFECT_TYPE,
          lockedAt: { lt: new Date(now.getTime() - DOCUMENT_LEASE_MS) },
        },
        {
          effectType: WHATSAPP_VOICE_EFFECT_TYPE,
          lockedAt: { lt: new Date(now.getTime() - VOICE_LEASE_MS) },
        },
      ],
    },
  })) as OutboxRow[];

  for (const row of expired) {
    if (!row.effectStartedAt) {
      await recoverPreEffectLease(context, row, now);
      continue;
    }

    let payload: QueuedPayload;
    try {
      payload = await openClaimedPayload(context, row);
    } catch {
      await markExpiredLeaseAmbiguous(
        context,
        row,
        "OUTBOX_PAYLOAD_INVALID_AFTER_EFFECT_START",
      );
      continue;
    }

    try {
      const receipt = await receiptLookup(row.effectKey, payload.requestBinding);
      if (receipt) {
        await markSucceeded(context, row, payload, receipt);
      } else {
        await markExpiredLeaseAmbiguous(
          context,
          row,
          "WORKER_LEASE_EXPIRED_WITHOUT_RECEIPT",
        );
      }
    } catch (error) {
      if (
        error instanceof SidecarRequestError &&
        error.code === "EFFECT_KEY_CONFLICT"
      ) {
        await markExpiredLeaseAmbiguous(
          context,
          row,
          "RECEIPT_BINDING_CONFLICT",
        );
      } else {
        await deferReceiptReconciliation(context, row, now);
      }
    }
  }
}

async function claimIntent(
  context: ServiceContext,
  effectKey?: string,
  receiptLookup: WhatsAppEffectReceiptLookup = sidecar.receipt,
): Promise<OutboxRow | null> {
  const now = new Date();
  await recoverExpiredLeases(context, now, receiptLookup);
  const candidate = await context.prisma.outboxIntent.findFirst({
    where: {
      effectType: {
        in: [
          WHATSAPP_TEXT_EFFECT_TYPE,
          WHATSAPP_IMAGE_EFFECT_TYPE,
          WHATSAPP_VIDEO_EFFECT_TYPE,
          WHATSAPP_DOCUMENT_EFFECT_TYPE,
          WHATSAPP_VOICE_EFFECT_TYPE,
        ],
      },
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
      ...(candidate.status === "retrying"
        ? { nextAttemptAt: candidate.nextAttemptAt }
        : {}),
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
          RETRY_DELAYS_MS[
            Math.min(row.attemptCount - 1, RETRY_DELAYS_MS.length - 1)
          ]!,
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
      throw new ConflictError(
        "WhatsApp send intent lease changed during failure recording",
      );
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
  errorCode:
    | "OUTBOX_PAYLOAD_INVALID"
    | "OUTBOX_EFFECT_START_FAILED"
    | "OUTBOX_MEDIA_INVALID",
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

async function markEffectStarted(
  context: ServiceContext,
  row: OutboxRow,
): Promise<OutboxRow> {
  const effectStartedAt = new Date();
  const marked = await context.prisma.outboxIntent.updateMany({
    where: { id: row.id, status: "processing", leaseToken: row.leaseToken },
    data: { effectStartedAt, lockedAt: effectStartedAt },
  });
  if (marked.count !== 1) {
    throw new ConflictError("WhatsApp send intent lease changed before dispatch");
  }
  return { ...row, effectStartedAt, lockedAt: effectStartedAt };
}

async function markSucceeded(
  context: ServiceContext,
  row: OutboxRow,
  payload: QueuedPayload,
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
        throw new ConflictError(
          "WhatsApp send intent lease changed before receipt commit",
        );
      }
      const effect = await tx.whatsAppOutboundEffect.updateMany({
        where: { effectKey: row.effectKey, messageId: payload.messageId },
        data: { providerMessageId },
      });
      if (effect.count !== 1) {
        throw new ConflictError(
          "WhatsApp receipt has no matching durable effect row",
        );
      }
      const messageExists = await setMessageDeliveryWithoutDowngrade(
        tx,
        payload.messageId,
        "sent",
      );
      if (!messageExists) {
        throw new ConflictError(
          "WhatsApp provider receipt has no matching local message",
        );
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
            effectType: row.effectType,
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

async function executeClaimed(
  context: ServiceContext,
  claimed: OutboxRow,
  sender: WhatsAppEffectSender,
  imageSender: WhatsAppImageEffectSender,
  videoSender: WhatsAppVideoEffectSender,
  documentSender: WhatsAppDocumentEffectSender,
  voiceSender: WhatsAppVoiceEffectSender,
): Promise<WhatsAppEffectStatus> {
  let payload: QueuedPayload;
  try {
    payload = await openClaimedPayload(context, claimed);
  } catch {
    return markPreEffectFailure(context, claimed, "OUTBOX_PAYLOAD_INVALID");
  }

  let mediaBytes: Buffer | null = null;
  if (
    claimed.effectType === WHATSAPP_IMAGE_EFFECT_TYPE ||
    claimed.effectType === WHATSAPP_VIDEO_EFFECT_TYPE ||
    claimed.effectType === WHATSAPP_DOCUMENT_EFFECT_TYPE ||
    claimed.effectType === WHATSAPP_VOICE_EFFECT_TYPE
  ) {
    try {
      const kind =
        claimed.effectType === WHATSAPP_IMAGE_EFFECT_TYPE
          ? "image"
          : claimed.effectType === WHATSAPP_VIDEO_EFFECT_TYPE
            ? "video"
            : claimed.effectType === WHATSAPP_DOCUMENT_EFFECT_TYPE
              ? "document"
              : "audio";
      const mediaPayload =
        claimed.effectType === WHATSAPP_IMAGE_EFFECT_TYPE
          ? queuedImagePayloadSchema.parse(payload)
          : claimed.effectType === WHATSAPP_VIDEO_EFFECT_TYPE
            ? queuedVideoPayloadSchema.parse(payload)
            : claimed.effectType === WHATSAPP_DOCUMENT_EFFECT_TYPE
              ? queuedDocumentPayloadSchema.parse(payload)
              : queuedVoicePayloadSchema.parse(payload);
      mediaBytes = (
        await readWhatsAppMediaObject(
          context,
          mediaPayload.messageId,
          kind,
          mediaPayload.media as WhatsAppMediaObjectReceipt,
        )
      ).bytes;
    } catch {
      return markPreEffectFailure(context, claimed, "OUTBOX_MEDIA_INVALID");
    }
  }

  let started: OutboxRow;
  try {
    started = await markEffectStarted(context, claimed);
  } catch {
    mediaBytes?.fill(0);
    return markPreEffectFailure(context, claimed, "OUTBOX_EFFECT_START_FAILED");
  }

  try {
    let receipt: SendReceipt;
    const quoted = payload.quoted ?? null;
    if (started.effectType === WHATSAPP_IMAGE_EFFECT_TYPE) {
      const imagePayload = payload as QueuedImagePayload;
      receipt = await imageSender(
        imagePayload.to,
        mediaBytes!,
        imagePayload.media.mediaType,
        imagePayload.caption,
        started.effectKey,
        imagePayload.requestBinding,
        quoted,
      );
    } else if (started.effectType === WHATSAPP_VIDEO_EFFECT_TYPE) {
      const videoPayload = payload as QueuedVideoPayload;
      receipt = await videoSender(
        videoPayload.to,
        mediaBytes!,
        videoPayload.media.mediaType,
        videoPayload.caption,
        started.effectKey,
        videoPayload.requestBinding,
        quoted,
      );
    } else if (started.effectType === WHATSAPP_DOCUMENT_EFFECT_TYPE) {
      const documentPayload = payload as QueuedDocumentPayload;
      receipt = await documentSender(
        documentPayload.to,
        mediaBytes!,
        documentPayload.media.mediaType,
        documentPayload.fileName,
        documentPayload.caption,
        started.effectKey,
        documentPayload.requestBinding,
        quoted,
      );
    } else if (started.effectType === WHATSAPP_VOICE_EFFECT_TYPE) {
      const voicePayload = payload as QueuedVoicePayload;
      receipt = await voiceSender(
        voicePayload.to,
        mediaBytes!,
        voicePayload.media.mediaType,
        voicePayload.voiceMessage,
        voicePayload.durationSeconds,
        started.effectKey,
        voicePayload.requestBinding,
        quoted,
      );
    } else {
      const textPayload = payload as QueuedTextPayload;
      receipt = await sender(
        textPayload.to,
        textPayload.text,
        started.effectKey,
        textPayload.requestBinding,
        quoted,
      );
    }
    return markSucceeded(context, started, payload, receipt);
  } catch (error) {
    return markFailure(context, started, error);
  } finally {
    mediaBytes?.fill(0);
  }
}

export async function processWhatsAppEffect(
  context: ServiceContext,
  effectKey: string,
  sender: WhatsAppEffectSender = sidecar.send,
  receiptLookup: WhatsAppEffectReceiptLookup = sidecar.receipt,
  imageSender: WhatsAppImageEffectSender = sidecar.sendImage,
  videoSender: WhatsAppVideoEffectSender = sidecar.sendVideo,
  documentSender: WhatsAppDocumentEffectSender = sidecar.sendDocument,
  voiceSender: WhatsAppVoiceEffectSender = sidecar.sendVoice,
): Promise<WhatsAppEffectStatus> {
  const claimed = await claimIntent(context, effectKey, receiptLookup);
  if (!claimed) return getWhatsAppEffectStatus(context, effectKey);
  return executeClaimed(
    context,
    claimed,
    sender,
    imageSender,
    videoSender,
    documentSender,
    voiceSender,
  );
}

export async function drainDueWhatsAppEffects(
  context: ServiceContext,
  limit = 10,
  sender: WhatsAppEffectSender = sidecar.send,
  receiptLookup: WhatsAppEffectReceiptLookup = sidecar.receipt,
  imageSender: WhatsAppImageEffectSender = sidecar.sendImage,
  videoSender: WhatsAppVideoEffectSender = sidecar.sendVideo,
  documentSender: WhatsAppDocumentEffectSender = sidecar.sendDocument,
  voiceSender: WhatsAppVoiceEffectSender = sidecar.sendVoice,
): Promise<WhatsAppEffectStatus[]> {
  const bounded = Math.max(1, Math.min(limit, 25));
  const results: WhatsAppEffectStatus[] = [];
  for (let index = 0; index < bounded; index += 1) {
    const claimed = await claimIntent(context, undefined, receiptLookup);
    if (!claimed) break;
    results.push(
      await executeClaimed(
        context,
        claimed,
        sender,
        imageSender,
        videoSender,
        documentSender,
        voiceSender,
      ),
    );
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

export async function openQueuedWhatsAppImageReceipt(
  context: ServiceContext,
  effectKey: string,
): Promise<WhatsAppMediaObjectReceipt> {
  const row = await readRow(context, effectKey);
  if (row.effectType !== WHATSAPP_IMAGE_EFFECT_TYPE) {
    throw new SahelFlowError("WhatsApp image send intent not found", "NOT_FOUND", 404);
  }
  const payload = queuedImagePayloadSchema.parse(await openClaimedPayload(context, row));
  return payload.media as WhatsAppMediaObjectReceipt;
}

export async function openQueuedWhatsAppVideoReceipt(
  context: ServiceContext,
  effectKey: string,
): Promise<WhatsAppMediaObjectReceipt> {
  const row = await readRow(context, effectKey);
  if (row.effectType !== WHATSAPP_VIDEO_EFFECT_TYPE) {
    throw new SahelFlowError("WhatsApp video send intent not found", "NOT_FOUND", 404);
  }
  const payload = queuedVideoPayloadSchema.parse(await openClaimedPayload(context, row));
  return payload.media as WhatsAppMediaObjectReceipt;
}

export async function openQueuedWhatsAppDocumentReceipt(
  context: ServiceContext,
  effectKey: string,
): Promise<WhatsAppMediaObjectReceipt> {
  const row = await readRow(context, effectKey);
  if (row.effectType !== WHATSAPP_DOCUMENT_EFFECT_TYPE) {
    throw new SahelFlowError("WhatsApp document send intent not found", "NOT_FOUND", 404);
  }
  const payload = queuedDocumentPayloadSchema.parse(await openClaimedPayload(context, row));
  return payload.media as WhatsAppMediaObjectReceipt;
}

export async function openQueuedWhatsAppVoiceReceipt(
  context: ServiceContext,
  effectKey: string,
): Promise<WhatsAppMediaObjectReceipt> {
  const row = await readRow(context, effectKey);
  if (row.effectType !== WHATSAPP_VOICE_EFFECT_TYPE) {
    throw new SahelFlowError("WhatsApp voice send intent not found", "NOT_FOUND", 404);
  }
  const payload = queuedVoicePayloadSchema.parse(await openClaimedPayload(context, row));
  return payload.media as WhatsAppMediaObjectReceipt;
}

export async function retryWhatsAppEffect(
  context: TrustedWhatsAppCommandContext,
  effectKey: string,
  confirmMayDuplicate: boolean,
  sender: WhatsAppEffectSender = sidecar.send,
  receiptLookup: WhatsAppEffectReceiptLookup = sidecar.receipt,
  imageSender: WhatsAppImageEffectSender = sidecar.sendImage,
  videoSender: WhatsAppVideoEffectSender = sidecar.sendVideo,
  documentSender: WhatsAppDocumentEffectSender = sidecar.sendDocument,
  voiceSender: WhatsAppVoiceEffectSender = sidecar.sendVoice,
): Promise<WhatsAppEffectStatus> {
  const row = await readRow(context, effectKey);
  const ambiguous = row.status === "failed" && row.outcomeState === "ambiguous";
  if (row.status !== "dead_letter" && !ambiguous) {
    throw new ConflictError(
      "Only dead-lettered or ambiguous WhatsApp sends can be retried",
    );
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
        attemptCount: 0,
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
      throw new ConflictError(
        "WhatsApp send recovery state changed; refresh and retry",
      );
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
          effectType: row.effectType,
        }),
      },
    });
  });
  return processWhatsAppEffect(
    context,
    effectKey,
    sender,
    receiptLookup,
    imageSender,
    videoSender,
    documentSender,
    voiceSender,
  );
}
