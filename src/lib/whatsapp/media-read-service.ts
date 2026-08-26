import "server-only";

import { z } from "zod";

import { getBusinessEnvelopeKey } from "@/lib/business-truth/envelope-key";
import { openBusinessPayloadWithKey } from "@/lib/business-truth/payload-codec";
import type { ServiceContext } from "@/lib/data/service-base";
import { SahelFlowError } from "@/types/errors";
import {
  whatsAppMediaEraseEpoch,
  whatsAppMediaErasePending,
} from "./media-erase-lifecycle";
import {
  openWhatsAppMessageAttachment,
  type WhatsAppMessageAttachment,
} from "./message-attachments";
import { WHATSAPP_MEDIA_FETCH_EFFECT_TYPE } from "./media-fetch-contract";
import {
  type WhatsAppBinaryMediaKind,
  WhatsAppMediaObjectError,
  type WhatsAppMediaObjectReceipt,
  whatsAppMediaRoot,
} from "./media-object-store";
import {
  readWhatsAppMediaObject,
  type WhatsAppMediaObjectProvenance,
} from "./media-object-provenance";

const binaryKinds = new Set<WhatsAppBinaryMediaKind>([
  "image",
  "video",
  "audio",
  "document",
  "sticker",
]);

const mediaReceiptSchema = z.object({
  formatVersion: z.literal(1),
  objectId: z.string().regex(/^[0-9a-f]{64}$/),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  sizeBytes: z.number().int().positive().safe(),
  chunkCount: z.number().int().positive().safe(),
  mediaType: z.string().min(1).max(128),
});

const successAuditSchema = z.object({
  effectKey: z.string().min(1).max(512),
  objectId: z.string().regex(/^[0-9a-f]{64}$/),
  objectCiphertextSha256: z.string().regex(/^[0-9a-f]{64}$/),
  objectCiphertextBytes: z.number().int().positive().safe(),
});

export interface OpenedInboxWhatsAppMedia {
  bytes: Buffer;
  mediaType: string;
  fileName: string;
  kind: WhatsAppBinaryMediaKind;
  sizeBytes: number;
}

function unavailable(message = "Saved WhatsApp media is not available"): SahelFlowError {
  return new SahelFlowError(message, "WHATSAPP_MEDIA_NOT_AVAILABLE", 404);
}

function integrityFailure(): SahelFlowError {
  return new SahelFlowError(
    "Saved WhatsApp media failed its integrity check",
    "WHATSAPP_MEDIA_INTEGRITY",
    409,
  );
}

function binaryKind(
  attachment: WhatsAppMessageAttachment | null,
): WhatsAppBinaryMediaKind | null {
  if (!attachment || !binaryKinds.has(attachment.kind as WhatsAppBinaryMediaKind)) {
    return null;
  }
  return attachment.kind as WhatsAppBinaryMediaKind;
}

function extensionFor(mediaType: string): string {
  switch (mediaType.toLowerCase()) {
    case "image/jpeg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    case "video/mp4":
      return ".mp4";
    case "audio/ogg":
      return ".ogg";
    case "audio/wav":
      return ".wav";
    case "audio/mpeg":
      return ".mp3";
    case "audio/amr":
      return ".amr";
    case "audio/aac":
      return ".aac";
    case "audio/mp4":
      return ".m4a";
    case "application/pdf":
      return ".pdf";
    case "application/zip":
      return ".zip";
    case "application/x-ole-storage":
      return ".bin";
    case "text/plain":
      return ".txt";
    default:
      return ".bin";
  }
}

function safeFileName(
  attachment: WhatsAppMessageAttachment,
  messageId: string,
  mediaType: string,
): string {
  const candidate = attachment.fileName
    ?.replace(/[\u0000-\u001f\u007f]/g, " ")
    .replaceAll("\\", "/")
    .split("/")
    .at(-1)
    ?.trim();
  if (candidate) return candidate.slice(0, 180);
  const suffix = messageId.replace(/[^a-zA-Z0-9_-]/g, "").slice(-24) || "media";
  return `whatsapp-${attachment.kind}-${suffix}${extensionFor(mediaType)}`;
}

function openReceipt(
  protectedReceipt: string,
  effectKey: string,
  effectType: string,
  commandId: string,
  envelopeKey: Buffer,
): WhatsAppMediaObjectReceipt {
  return mediaReceiptSchema.parse(
    openBusinessPayloadWithKey(
      protectedReceipt,
      {
        kind: "outbox-intent-receipt",
        recordKey: effectKey,
        recordType: effectType,
        commandId,
      },
      envelopeKey,
    ),
  );
}

function assertAuditProvenance(
  metadata: string | null,
  effectKey: string,
  receipt: WhatsAppMediaObjectReceipt,
  provenance: WhatsAppMediaObjectProvenance,
): void {
  if (!metadata) throw integrityFailure();
  let parsed: unknown;
  try {
    parsed = JSON.parse(metadata);
  } catch {
    throw integrityFailure();
  }
  const audit = successAuditSchema.safeParse(parsed);
  if (
    !audit.success ||
    audit.data.effectKey !== effectKey ||
    audit.data.objectId !== receipt.objectId ||
    audit.data.objectCiphertextSha256 !== provenance.ciphertextSha256 ||
    audit.data.objectCiphertextBytes !== provenance.ciphertextBytes
  ) {
    throw integrityFailure();
  }
}

function readEpoch(scopeRoot: string): number {
  try {
    if (whatsAppMediaErasePending(scopeRoot)) throw unavailable();
    return whatsAppMediaEraseEpoch(scopeRoot);
  } catch (error) {
    if (error instanceof SahelFlowError) throw error;
    throw integrityFailure();
  }
}

function assertSameReadableEpoch(scopeRoot: string, expectedEpoch: number): void {
  try {
    if (
      whatsAppMediaEraseEpoch(scopeRoot) !== expectedEpoch ||
      whatsAppMediaErasePending(scopeRoot)
    ) {
      throw unavailable();
    }
  } catch (error) {
    if (error instanceof SahelFlowError) throw error;
    throw integrityFailure();
  }
}

/**
 * Resolve one seller-visible media read entirely from canonical local truth.
 * Browser callers provide only a canonical Message ID; provider retrieval
 * secrets, object IDs and filesystem locations never cross the API boundary.
 */
export async function openInboxWhatsAppMedia(
  context: ServiceContext,
  messageId: string,
): Promise<OpenedInboxWhatsAppMedia> {
  const scopeRoot = whatsAppMediaRoot(context);
  const eraseEpoch = readEpoch(scopeRoot);

  const message = await context.prisma.message.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      direction: true,
      messageType: true,
      attachments: true,
    },
  });
  if (!message || message.direction !== "inbound") throw unavailable();

  let attachment: WhatsAppMessageAttachment | null;
  try {
    attachment = await openWhatsAppMessageAttachment(
      context,
      message.id,
      message.attachments,
    );
  } catch {
    throw integrityFailure();
  }
  const kind = binaryKind(attachment);
  if (
    !attachment ||
    !kind ||
    attachment.state === "rejected" ||
    message.messageType !== kind
  ) {
    throw unavailable();
  }

  const effectKey = `whatsapp-media-fetch:${message.id}`;
  const intent = await context.prisma.outboxIntent.findFirst({
    where: { effectKey },
    select: {
      effectKey: true,
      effectType: true,
      commandId: true,
      status: true,
      outcomeState: true,
      receiptJson: true,
    },
  });
  if (
    !intent ||
    intent.effectType !== WHATSAPP_MEDIA_FETCH_EFFECT_TYPE ||
    intent.status !== "succeeded" ||
    intent.outcomeState !== "receipt" ||
    !intent.receiptJson
  ) {
    throw unavailable();
  }

  const key = await getBusinessEnvelopeKey(context);
  let receipt: WhatsAppMediaObjectReceipt;
  try {
    receipt = openReceipt(
      intent.receiptJson,
      intent.effectKey,
      intent.effectType,
      intent.commandId,
      key,
    );
  } catch {
    throw integrityFailure();
  } finally {
    key.fill(0);
  }

  let opened: Awaited<ReturnType<typeof readWhatsAppMediaObject>>;
  try {
    opened = await readWhatsAppMediaObject(context, message.id, kind, receipt);
  } catch (error) {
    if (error instanceof WhatsAppMediaObjectError) throw integrityFailure();
    throw error;
  }

  try {
    const audits = await context.prisma.auditLog.findMany({
      where: {
        action: "whatsapp.media.fetch_succeeded",
        entity: "message",
        entityId: message.id,
      },
      orderBy: { createdAt: "asc" },
      take: 2,
      select: { metadata: true },
    });
    if (audits.length !== 1) throw integrityFailure();
    assertAuditProvenance(
      audits[0]?.metadata ?? null,
      effectKey,
      receipt,
      opened.provenance,
    );
    if (
      attachment.sizeBytes !== null &&
      attachment.sizeBytes !== receipt.sizeBytes
    ) {
      throw integrityFailure();
    }

    // A destructive erase can stage, commit and remove its tombstone while this
    // request is suspended in any await above. Re-check both canonical Message
    // truth and the same-process erase generation before exposing plaintext.
    const stillCanonical = await context.prisma.message.findUnique({
      where: { id: message.id },
      select: { id: true },
    });
    if (!stillCanonical) throw unavailable();
    assertSameReadableEpoch(scopeRoot, eraseEpoch);

    return {
      bytes: opened.bytes,
      mediaType: opened.mediaType,
      fileName: safeFileName(attachment, message.id, opened.mediaType),
      kind,
      sizeBytes: receipt.sizeBytes,
    };
  } catch (error) {
    opened.bytes.fill(0);
    throw error;
  }
}
