import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { z } from "zod";

import {
  AI_CHAT_ATTACHMENT_MAX_BYTES,
  AI_CHAT_ATTACHMENT_MAX_COUNT,
  AI_CHAT_ATTACHMENT_TYPES,
  type AiChatAttachmentMeta,
  type AiChatAttachmentType,
} from "@/lib/ai/chat/attachment-limits";
import { getBusinessEnvelopeKey } from "@/lib/business-truth/envelope-key";
import type { ServiceContext } from "@/lib/data/service-base";
import type { DbClient } from "@/lib/db";
import type { ShopContext } from "@/lib/shops/context";
import { SahelFlowError } from "@/types/errors";

const KEY_PURPOSE = "sahelflow/ai-chat-attachment/key/v1";
const AAD_PURPOSE = "sahelflow/ai-chat-attachment/aad/v1";
const PAYLOAD_VERSION = 1;

/** Wire shape of one image in a send request (base64 without a data: prefix). */
export const aiChatAttachmentInputSchema = z.object({
  mediaType: z.enum(AI_CHAT_ATTACHMENT_TYPES),
  data: z.string().min(16).max(Math.ceil((AI_CHAT_ATTACHMENT_MAX_BYTES * 4) / 3) + 8),
  width: z.number().int().positive().max(20_000).optional(),
  height: z.number().int().positive().max(20_000).optional(),
});
export const aiChatAttachmentsInputSchema = z
  .array(aiChatAttachmentInputSchema)
  .max(AI_CHAT_ATTACHMENT_MAX_COUNT)
  .optional()
  .default([]);
export type AiChatAttachmentInput = z.infer<typeof aiChatAttachmentInputSchema>;

/** A validated image ready for the model and for storage. */
export interface AiChatImage {
  mediaType: AiChatAttachmentType;
  bytes: Buffer;
  width: number | null;
  height: number | null;
}

export class AiChatAttachmentError extends SahelFlowError {
  constructor(message: string) {
    super(message, "AI_ATTACHMENT_INVALID", 400);
    this.name = "AiChatAttachmentError";
  }
}

/** Identify the image from its bytes; the declared type must agree. */
export function sniffAiChatImageType(bytes: Buffer): AiChatAttachmentType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

/** Decode and authenticate every image of a request; throws on the first bad one. */
export function decodeAiChatImages(inputs: AiChatAttachmentInput[]): AiChatImage[] {
  return inputs.map((input) => {
    const bytes = Buffer.from(input.data, "base64");
    if (bytes.length === 0 || bytes.length > AI_CHAT_ATTACHMENT_MAX_BYTES) {
      throw new AiChatAttachmentError("Image is empty or larger than the limit");
    }
    if (sniffAiChatImageType(bytes) !== input.mediaType) {
      throw new AiChatAttachmentError("Image content does not match its declared type");
    }
    return {
      mediaType: input.mediaType,
      bytes,
      width: input.width ?? null,
      height: input.height ?? null,
    };
  });
}

function attachmentKey(envelopeKey: Buffer): Buffer {
  return createHmac("sha256", envelopeKey).update(KEY_PURPOSE).digest();
}

function attachmentAad(attachmentId: string, mediaType: string): Buffer {
  return Buffer.from(`${AAD_PURPOSE}\n${attachmentId}\n${mediaType}`, "utf8");
}

function sealWithKey(
  key: Buffer,
  attachmentId: string,
  image: AiChatImage,
): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(attachmentAad(attachmentId, image.mediaType));
  const ciphertext = Buffer.concat([cipher.update(image.bytes), cipher.final()]);
  return JSON.stringify({
    v: PAYLOAD_VERSION,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ct: ciphertext.toString("base64"),
  });
}

/**
 * Store the images of one user turn. Each row's ciphertext is bound to its own
 * id and media type, so a payload moved to another row fails to open.
 */
export async function storeAiChatAttachments(
  context: { prisma: DbClient; shop: ShopContext },
  messageId: string,
  images: AiChatImage[],
): Promise<AiChatAttachmentMeta[]> {
  if (images.length === 0) return [];
  const key = attachmentKey(await getBusinessEnvelopeKey(context));
  try {
    const stored: AiChatAttachmentMeta[] = [];
    for (const image of images) {
      const id = randomUUID();
      await context.prisma.aiChatAttachment.create({
        data: {
          id,
          messageId,
          mediaType: image.mediaType,
          sizeBytes: image.bytes.length,
          width: image.width,
          height: image.height,
          payload: sealWithKey(key, id, image),
        },
      });
      stored.push({
        id,
        mediaType: image.mediaType,
        sizeBytes: image.bytes.length,
        width: image.width,
        height: image.height,
      });
    }
    return stored;
  } finally {
    key.fill(0);
  }
}

/** Open one stored image; malformed, swapped or tampered payloads fail closed. */
export async function openAiChatAttachment(
  context: ServiceContext,
  row: { id: string; mediaType: string; payload: string },
): Promise<Buffer> {
  const key = attachmentKey(await getBusinessEnvelopeKey(context));
  try {
    const parsed = JSON.parse(row.payload) as {
      v?: unknown;
      iv?: unknown;
      tag?: unknown;
      ct?: unknown;
    };
    if (
      parsed.v !== PAYLOAD_VERSION ||
      typeof parsed.iv !== "string" ||
      typeof parsed.tag !== "string" ||
      typeof parsed.ct !== "string"
    ) {
      throw new Error("unsupported payload");
    }
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(parsed.iv, "base64"),
    );
    decipher.setAAD(attachmentAad(row.id, row.mediaType));
    decipher.setAuthTag(Buffer.from(parsed.tag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(parsed.ct, "base64")),
      decipher.final(),
    ]);
  } catch {
    throw new SahelFlowError(
      "Stored chat image could not be opened",
      "AI_ATTACHMENT_CORRUPT",
      500,
    );
  } finally {
    key.fill(0);
  }
}

/** Metadata select used wherever messages are listed. */
export const AI_CHAT_ATTACHMENT_META_SELECT = {
  id: true,
  mediaType: true,
  sizeBytes: true,
  width: true,
  height: true,
} as const;
