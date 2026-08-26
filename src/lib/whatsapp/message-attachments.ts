import "server-only";

import { z } from "zod";

import { getBusinessEnvelopeKey } from "@/lib/business-truth/envelope-key";
import {
  openBusinessPayloadWithKey,
  sealBusinessPayloadWithKey,
} from "@/lib/business-truth/payload-codec";
import type { ServiceContext } from "@/lib/data/service-base";

const MAX_METADATA_TEXT = 512;
const MAX_VCARD_BYTES = 64 * 1024;

const MEDIA_LIMITS = {
  image: 20 * 1024 * 1024,
  video: 64 * 1024 * 1024,
  audio: 32 * 1024 * 1024,
  document: 64 * 1024 * 1024,
  sticker: 4 * 1024 * 1024,
} as const;

const SAFE_MEDIA_TYPES = {
  image: /^(image\/(?:jpeg|png|webp))$/i,
  video: /^(video\/(?:mp4|3gpp|quicktime))$/i,
  audio: /^(audio\/(?:aac|amr|mpeg|mp4|ogg|opus|wav|x-wav))$/i,
  document:
    /^(application\/(?:pdf|msword|vnd\.openxmlformats-officedocument\.(?:wordprocessingml\.document|spreadsheetml\.sheet)|vnd\.ms-excel)|text\/(?:csv|plain))$/i,
  sticker: /^(image\/webp)$/i,
} as const;

export const whatsAppAttachmentSchema = z.object({
  formatVersion: z.literal(1),
  kind: z.enum([
    "image",
    "video",
    "audio",
    "document",
    "sticker",
    "location",
    "contact",
  ]),
  state: z.enum(["ready", "metadata-only", "rejected"]),
  mimeType: z.string().max(128).nullable(),
  fileName: z.string().max(180).nullable(),
  sizeBytes: z.number().int().nonnegative().safe().nullable(),
  durationSeconds: z.number().int().nonnegative().safe().nullable(),
  width: z.number().int().positive().safe().nullable(),
  height: z.number().int().positive().safe().nullable(),
  voiceMessage: z.boolean(),
  location: z
    .object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      name: z.string().max(MAX_METADATA_TEXT).nullable(),
      address: z.string().max(MAX_METADATA_TEXT).nullable(),
    })
    .nullable(),
  contact: z
    .object({
      displayName: z.string().max(256),
      vcard: z.string().max(MAX_VCARD_BYTES),
    })
    .nullable(),
  failureCode: z
    .enum([
      "DECLARED_SIZE_LIMIT",
      "UNSUPPORTED_MIME_TYPE",
      "INVALID_LOCATION",
      "CONTACT_PAYLOAD_INVALID",
    ])
    .nullable(),
});

export type WhatsAppMessageAttachment = z.infer<
  typeof whatsAppAttachmentSchema
>;

/**
 * Structured contact cards and exact locations are customer-contact data, not
 * ordinary conversation metadata. Keep the attachment kind visible to actors
 * without contact authority, but remove every structured value that could
 * identify or locate the customer.
 */
export function projectWhatsAppMessageAttachmentForContactAccess(
  attachment: WhatsAppMessageAttachment | null,
  contactAllowed: boolean,
): WhatsAppMessageAttachment | null {
  if (
    !attachment ||
    contactAllowed ||
    (attachment.kind !== "contact" && attachment.kind !== "location")
  ) {
    return attachment;
  }
  return {
    ...attachment,
    state: attachment.state === "rejected" ? "rejected" : "metadata-only",
    fileName: null,
    sizeBytes: null,
    location: null,
    contact: null,
  };
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown, maximum = MAX_METADATA_TEXT): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return normalized ? normalized.slice(0, maximum) : null;
}

function safeFileName(value: unknown): string | null {
  const candidate = text(value, 180);
  if (!candidate) return null;
  const leaf = candidate.replaceAll("\\", "/").split("/").at(-1)?.trim();
  return leaf ? leaf.slice(0, 180) : null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return value;
  }
  if (typeof value === "string" && /^\d{1,16}$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  const structured = record(value);
  const low = structured?.low;
  const high = structured?.high;
  if (
    typeof low === "number" &&
    Number.isInteger(low) &&
    (high === undefined || high === 0)
  ) {
    return low >>> 0;
  }
  return null;
}

function positiveDimension(value: unknown): number | null {
  const parsed = numberValue(value);
  return parsed && parsed > 0 ? parsed : null;
}

function rejected(
  kind: keyof typeof MEDIA_LIMITS,
  source: Record<string, unknown>,
  failureCode: WhatsAppMessageAttachment["failureCode"],
): WhatsAppMessageAttachment {
  return {
    ...mediaMetadata(kind, source),
    state: "rejected",
    failureCode,
  };
}

function mediaMetadata(
  kind: keyof typeof MEDIA_LIMITS,
  source: Record<string, unknown>,
): WhatsAppMessageAttachment {
  return {
    formatVersion: 1,
    kind,
    state: "metadata-only",
    mimeType: text(source.mimetype, 128),
    fileName: safeFileName(source.fileName),
    sizeBytes: numberValue(source.fileLength),
    durationSeconds: numberValue(source.seconds),
    width: positiveDimension(source.width),
    height: positiveDimension(source.height),
    voiceMessage: kind === "audio" && source.ptt === true,
    location: null,
    contact: null,
    failureCode: null,
  };
}

function extractMedia(
  kind: keyof typeof MEDIA_LIMITS,
  source: Record<string, unknown>,
): WhatsAppMessageAttachment {
  const metadata = mediaMetadata(kind, source);
  if (
    metadata.sizeBytes !== null &&
    metadata.sizeBytes > MEDIA_LIMITS[kind]
  ) {
    return rejected(kind, source, "DECLARED_SIZE_LIMIT");
  }
  if (
    metadata.mimeType !== null &&
    !SAFE_MEDIA_TYPES[kind].test(metadata.mimeType)
  ) {
    return rejected(kind, source, "UNSUPPORTED_MIME_TYPE");
  }
  return metadata;
}

function locationAttachment(
  source: Record<string, unknown>,
): WhatsAppMessageAttachment {
  const latitude = source.degreesLatitude;
  const longitude = source.degreesLongitude;
  const valid =
    typeof latitude === "number" &&
    Number.isFinite(latitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    typeof longitude === "number" &&
    Number.isFinite(longitude) &&
    longitude >= -180 &&
    longitude <= 180;
  return {
    formatVersion: 1,
    kind: "location",
    state: valid ? "ready" : "rejected",
    mimeType: null,
    fileName: null,
    sizeBytes: null,
    durationSeconds: null,
    width: null,
    height: null,
    voiceMessage: false,
    location: valid
      ? {
          latitude,
          longitude,
          name: text(source.name),
          address: text(source.address),
        }
      : null,
    contact: null,
    failureCode: valid ? null : "INVALID_LOCATION",
  };
}

function contactAttachment(
  source: Record<string, unknown>,
): WhatsAppMessageAttachment {
  const displayName = text(source.displayName, 256);
  const vcard = typeof source.vcard === "string" ? source.vcard.trim() : "";
  const valid =
    Boolean(displayName) &&
    vcard.length > 0 &&
    Buffer.byteLength(vcard, "utf8") <= MAX_VCARD_BYTES;
  return {
    formatVersion: 1,
    kind: "contact",
    state: valid ? "ready" : "rejected",
    mimeType: "text/vcard",
    fileName: displayName ? `${safeFileName(displayName) ?? "contact"}.vcf` : null,
    sizeBytes: valid ? Buffer.byteLength(vcard, "utf8") : null,
    durationSeconds: null,
    width: null,
    height: null,
    voiceMessage: false,
    location: null,
    contact: valid ? { displayName: displayName!, vcard } : null,
    failureCode: valid ? null : "CONTACT_PAYLOAD_INVALID",
  };
}

/**
 * Extract only bounded, display-safe provider metadata. Provider URLs, media
 * keys and direct paths remain inside the encrypted ingress evidence and never
 * become browser-visible attachment references.
 */
export function extractWhatsAppMessageAttachment(
  payload: Record<string, unknown>,
): WhatsAppMessageAttachment | null {
  const mediaCandidates = [
    ["image", payload.imageMessage],
    ["video", payload.videoMessage],
    ["audio", payload.audioMessage],
    ["document", payload.documentMessage],
    ["sticker", payload.stickerMessage],
  ] as const;
  for (const [kind, value] of mediaCandidates) {
    const source = record(value);
    if (source) return extractMedia(kind, source);
  }

  const location =
    record(payload.locationMessage) ?? record(payload.liveLocationMessage);
  if (location) return locationAttachment(location);

  const contact = record(payload.contactMessage);
  if (contact) return contactAttachment(contact);

  const contacts = record(payload.contactsArrayMessage);
  const firstContact = Array.isArray(contacts?.contacts)
    ? record(contacts.contacts[0])
    : null;
  if (!firstContact) return null;
  const first = contactAttachment(firstContact);
  // A contacts-array provider payload may contain more than one vCard. The
  // first bounded record is useful metadata, but the array is never presented
  // as complete structured content until the canonical schema retains all of it.
  return first.state === "ready" ? { ...first, state: "metadata-only" } : first;
}

function attachmentBinding(messageId: string) {
  return {
    kind: "whatsapp-message-attachments" as const,
    recordKey: messageId,
    recordType: "whatsapp-message-attachments-v1",
    commandId: messageId,
  };
}

export function sealWhatsAppMessageAttachmentWithKey(
  messageId: string,
  attachment: WhatsAppMessageAttachment,
  envelopeKey: Buffer,
): string {
  return sealBusinessPayloadWithKey(
    whatsAppAttachmentSchema.parse(attachment),
    attachmentBinding(messageId),
    envelopeKey,
  );
}

export function openWhatsAppMessageAttachmentWithKey(
  messageId: string,
  protectedAttachment: string,
  envelopeKey: Buffer,
): WhatsAppMessageAttachment {
  return whatsAppAttachmentSchema.parse(
    openBusinessPayloadWithKey(
      protectedAttachment,
      attachmentBinding(messageId),
      envelopeKey,
    ),
  );
}

export async function openWhatsAppMessageAttachment(
  context: ServiceContext,
  messageId: string,
  protectedAttachment: string | null,
): Promise<WhatsAppMessageAttachment | null> {
  if (!protectedAttachment) return null;
  const key = await getBusinessEnvelopeKey(context);
  try {
    return openWhatsAppMessageAttachmentWithKey(
      messageId,
      protectedAttachment,
      key,
    );
  } finally {
    key.fill(0);
  }
}
