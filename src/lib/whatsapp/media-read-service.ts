import "server-only";

import { z } from "zod";

import { getBusinessEnvelopeKey } from "@/lib/business-truth/envelope-key";
import { openBusinessPayloadWithKey } from "@/lib/business-truth/payload-codec";
import type { ServiceContext } from "@/lib/data/service-base";
import { SahelFlowError } from "@/types/errors";
import {
  openQueuedWhatsAppDocumentReceipt,
  openQueuedWhatsAppImageReceipt,
  openQueuedWhatsAppVideoReceipt,
  openQueuedWhatsAppVoiceReceipt,
} from "./durable-send";
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
  readWhatsAppMediaObjectThumbnail,
} from "./media-object-store";
import {
  readWhatsAppMediaObject,
  WhatsAppMediaReadAbortedError,
  type WhatsAppMediaObjectProvenance,
  type WhatsAppMediaPlaintextRange,
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
  /** Total authenticated plaintext size, not just the returned range length. */
  sizeBytes: number;
}

export interface PreparedInboxWhatsAppMedia {
  messageId: string;
  kind: WhatsAppBinaryMediaKind;
  sizeBytes: number;
  mediaType: string;
  fileName: string;
  effectKey: string;
  receipt: WhatsAppMediaObjectReceipt;
  scopeRoot: string;
  eraseEpoch: number;
  /** Inbound provider downloads require the immutable fetch-success provenance audit. */
  requiresFetchAudit: boolean;
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

const OOXML_DOCUMENT_MIMES = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

/**
 * OOXML documents are ZIP containers: the encrypted store truthfully
 * classifies the bytes as application/zip while the recipient-facing
 * attachment resolves to the declared Office mimetype (so the recipient's
 * phone renders the document, never a raw .zip). Both views of the same
 * container are consistent for the authenticated read path.
 */
function attachmentMatchesReceiptMimeType(
  attachmentMimeType: string,
  receiptMediaType: string,
): boolean {
  const attachment = attachmentMimeType.split(";", 1)[0]?.trim().toLowerCase();
  const receipt = receiptMediaType.trim().toLowerCase();
  if (!attachment || !receipt) return false;
  if (attachment === receipt) return true;
  return receipt === "application/zip" && OOXML_DOCUMENT_MIMES.has(attachment);
}

function requestAborted(): SahelFlowError {
  return new SahelFlowError(
    "WhatsApp media request was canceled",
    "WHATSAPP_MEDIA_REQUEST_ABORTED",
    499,
  );
}

function assertRequestActive(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw requestAborted();
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

// Outbound document attachments seal the sniffed classification (zip/OLE
// storage/text) rather than the seller's original Office/CSV declaration, so
// the recipient-visible file name is the only safe source for its extension.
const DOCUMENT_NAME_EXTENSIONS = new Set([
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".txt",
  ".csv",
]);

function safeExtension(
  attachment: WhatsAppMessageAttachment,
  verifiedMediaType: string,
): string {
  if (attachment.kind === "document" && attachment.fileName) {
    const leaf = attachment.fileName
      .replaceAll("\\", "/")
      .split("/")
      .at(-1)
      ?.trim();
    const extension = /\.[A-Za-z0-9]{2,7}$/.exec(leaf ?? "")?.[0].toLowerCase();
    if (extension && DOCUMENT_NAME_EXTENSIONS.has(extension)) {
      return extension;
    }
  }
  const declared = attachment.mimeType?.split(";", 1)[0]?.trim().toLowerCase();
  switch (declared) {
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return ".docx";
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      return ".xlsx";
    case "application/msword":
      return ".doc";
    case "application/vnd.ms-excel":
      return ".xls";
    case "text/csv":
      return ".csv";
    case "text/plain":
      return ".txt";
    default:
      return extensionFor(verifiedMediaType);
  }
}

function safeFileName(
  attachment: WhatsAppMessageAttachment,
  messageId: string,
  mediaType: string,
): string {
  const extension = safeExtension(attachment, mediaType);
  const candidate = attachment.fileName
    ?.replace(/[\u0000-\u001f\u007f]/g, " ")
    .replaceAll("\\", "/")
    .split("/")
    .at(-1)
    ?.trim();
  const suffix = messageId.replace(/[^a-zA-Z0-9_-]/g, "").slice(-24) || "media";
  const fallbackStem = `whatsapp-${attachment.kind}-${suffix}`;
  const candidateStem = candidate
    ?.replace(/\.[^.]*$/, "")
    .replace(/[. ]+$/g, "")
    .trim();
  const stem = candidateStem || fallbackStem;
  return `${stem.slice(0, Math.max(1, 180 - extension.length))}${extension}`;
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

/** Resolve canonical seller media metadata and receipt before object decryption. */
export async function prepareInboxWhatsAppMedia(
  context: ServiceContext,
  messageId: string,
): Promise<PreparedInboxWhatsAppMedia> {
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
  if (!message) throw unavailable();

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

  if (message.direction === "outbound") {
    if (
      kind !== "image" &&
      kind !== "video" &&
      kind !== "document" &&
      kind !== "audio"
    ) {
      throw unavailable();
    }
    const effect = await context.prisma.whatsAppOutboundEffect.findUnique({
      where: { messageId: message.id },
      select: { effectKey: true },
    });
    if (!effect) throw unavailable();

    let receipt: WhatsAppMediaObjectReceipt;
    try {
      receipt = mediaReceiptSchema.parse(
        kind === "image"
          ? await openQueuedWhatsAppImageReceipt(context, effect.effectKey)
          : kind === "video"
            ? await openQueuedWhatsAppVideoReceipt(context, effect.effectKey)
            : kind === "document"
              ? await openQueuedWhatsAppDocumentReceipt(context, effect.effectKey)
              : await openQueuedWhatsAppVoiceReceipt(context, effect.effectKey),
      );
    } catch {
      throw integrityFailure();
    }
    if (
      (attachment.sizeBytes !== null && attachment.sizeBytes !== receipt.sizeBytes) ||
      (attachment.mimeType !== null &&
        !attachmentMatchesReceiptMimeType(attachment.mimeType, receipt.mediaType))
    ) {
      throw integrityFailure();
    }
    return {
      messageId: message.id,
      kind,
      sizeBytes: receipt.sizeBytes,
      mediaType: receipt.mediaType,
      fileName: safeFileName(attachment, message.id, receipt.mediaType),
      effectKey: effect.effectKey,
      receipt,
      scopeRoot,
      eraseEpoch,
      requiresFetchAudit: false,
    };
  }

  if (message.direction !== "inbound") throw unavailable();
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

  if (
    attachment.sizeBytes !== null &&
    attachment.sizeBytes !== receipt.sizeBytes
  ) {
    throw integrityFailure();
  }

  return {
    messageId: message.id,
    kind,
    sizeBytes: receipt.sizeBytes,
    mediaType: receipt.mediaType,
    fileName: safeFileName(attachment, message.id, receipt.mediaType),
    effectKey,
    receipt,
    scopeRoot,
    eraseEpoch,
    requiresFetchAudit: true,
  };
}

/** Authenticate the full object while retaining only the requested interval. */
export async function openPreparedInboxWhatsAppMedia(
  context: ServiceContext,
  prepared: PreparedInboxWhatsAppMedia,
  range?: WhatsAppMediaPlaintextRange,
  signal?: AbortSignal,
): Promise<OpenedInboxWhatsAppMedia> {
  assertRequestActive(signal);
  let opened: Awaited<ReturnType<typeof readWhatsAppMediaObject>>;
  try {
    opened = await readWhatsAppMediaObject(
      context,
      prepared.messageId,
      prepared.kind,
      prepared.receipt,
      range,
      signal,
    );
  } catch (error) {
    if (error instanceof WhatsAppMediaReadAbortedError) throw requestAborted();
    if (error instanceof WhatsAppMediaObjectError) throw integrityFailure();
    throw error;
  }

  try {
    assertRequestActive(signal);
    if (prepared.requiresFetchAudit) {
      const audits = await context.prisma.auditLog.findMany({
        where: {
          action: "whatsapp.media.fetch_succeeded",
          entity: "message",
          entityId: prepared.messageId,
        },
        orderBy: { createdAt: "asc" },
        take: 2,
        select: { metadata: true },
      });
      assertRequestActive(signal);
      if (audits.length !== 1) throw integrityFailure();
      assertAuditProvenance(
        audits[0]?.metadata ?? null,
        prepared.effectKey,
        prepared.receipt,
        opened.provenance,
      );
    }

    const stillCanonical = await context.prisma.message.findUnique({
      where: { id: prepared.messageId },
      select: { id: true },
    });
    assertRequestActive(signal);
    if (!stillCanonical) throw unavailable();
    assertSameReadableEpoch(prepared.scopeRoot, prepared.eraseEpoch);

    return {
      bytes: opened.bytes,
      mediaType: opened.mediaType,
      fileName: prepared.fileName,
      kind: prepared.kind,
      sizeBytes: prepared.sizeBytes,
    };
  } catch (error) {
    opened.bytes.fill(0);
    throw error;
  }
}

/** Backward-compatible full-object seller read used by integration contracts. */
export async function openInboxWhatsAppMedia(
  context: ServiceContext,
  messageId: string,
): Promise<OpenedInboxWhatsAppMedia> {
  const prepared = await prepareInboxWhatsAppMedia(context, messageId);
  return openPreparedInboxWhatsAppMedia(context, prepared);
}

export interface OpenedInboxWhatsAppThumbnail {
  bytes: Buffer;
  mediaType: string;
}

/**
 * Open the derived bounded thumbnail for an image/sticker message (#317).
 * Guarded by the same canonical-message and erase-epoch authority as full
 * reads; the canonical object is never touched and an absent thumbnail fails
 * closed with 404 so the UI falls back to the authenticated full read.
 */
export async function openInboxWhatsAppThumbnail(
  context: ServiceContext,
  messageId: string,
): Promise<OpenedInboxWhatsAppThumbnail> {
  const scopeRoot = whatsAppMediaRoot(context);
  const eraseEpoch = readEpoch(scopeRoot);
  const message = await context.prisma.message.findUnique({
    where: { id: messageId },
    select: { id: true, messageType: true },
  });
  if (
    !message ||
    (message.messageType !== "image" && message.messageType !== "sticker")
  ) {
    throw unavailable();
  }
  let opened: Awaited<ReturnType<typeof readWhatsAppMediaObjectThumbnail>>;
  try {
    opened = await readWhatsAppMediaObjectThumbnail(context, messageId);
  } catch (error) {
    if (
      error instanceof WhatsAppMediaObjectError &&
      error.code === "MEDIA_OBJECT_NOT_FOUND"
    ) {
      throw unavailable();
    }
    if (error instanceof WhatsAppMediaObjectError) throw integrityFailure();
    throw error;
  }
  try {
    assertSameReadableEpoch(scopeRoot, eraseEpoch);
    return { bytes: opened.bytes, mediaType: opened.receipt.mediaType };
  } catch (error) {
    opened.bytes.fill(0);
    throw error;
  }
}
