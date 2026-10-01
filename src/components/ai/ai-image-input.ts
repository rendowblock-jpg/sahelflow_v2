"use client";

import type { AiAttachmentView, AiOutgoingImage } from "@/components/ai/ai-workspace-types";
import {
  AI_CHAT_ATTACHMENT_MAX_BYTES,
  AI_CHAT_ATTACHMENT_MAX_EDGE,
  AI_CHAT_ATTACHMENT_SOURCE_MAX_BYTES,
  AI_CHAT_ATTACHMENT_TYPES,
  aiChatAttachmentUrl,
} from "@/lib/ai/chat/attachment-limits";

export type AiImageRejection = "unsupported" | "too-large" | "unreadable";

export class AiImageError extends Error {
  constructor(public readonly reason: AiImageRejection) {
    super(reason);
    this.name = "AiImageError";
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.readAsDataURL(blob);
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

function mediaTypeOf(file: Blob): string {
  return file.type.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

/**
 * Prepare one picked, pasted or dropped image for the model. Photos are
 * downsized to AI_CHAT_ATTACHMENT_MAX_EDGE on their longest side and
 * re-encoded as WebP (screenshots stay sharp at 0.9); images already small
 * enough keep their original bytes. The route re-checks every byte.
 */
export async function prepareAiImage(file: File): Promise<AiOutgoingImage> {
  const sourceType = mediaTypeOf(file);
  if (!(AI_CHAT_ATTACHMENT_TYPES as readonly string[]).includes(sourceType)) {
    throw new AiImageError("unsupported");
  }
  if (file.size <= 0 || file.size > AI_CHAT_ATTACHMENT_SOURCE_MAX_BYTES) {
    throw new AiImageError("too-large");
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new AiImageError("unreadable");
  }

  try {
    const longest = Math.max(bitmap.width, bitmap.height);
    const scale = longest > AI_CHAT_ATTACHMENT_MAX_EDGE ? AI_CHAT_ATTACHMENT_MAX_EDGE / longest : 1;
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    let output: Blob = file;
    let mediaType = sourceType;
    if (scale < 1 || file.size > AI_CHAT_ATTACHMENT_MAX_BYTES / 2) {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new AiImageError("unreadable");
      context.drawImage(bitmap, 0, 0, width, height);
      const encoded =
        (await canvasToBlob(canvas, "image/webp", 0.9)) ??
        (await canvasToBlob(canvas, "image/jpeg", 0.9));
      if (!encoded) throw new AiImageError("unreadable");
      output = encoded;
      mediaType = mediaTypeOf(encoded);
    }
    if (output.size > AI_CHAT_ATTACHMENT_MAX_BYTES) {
      throw new AiImageError("too-large");
    }

    return {
      mediaType,
      data: await blobToBase64(output),
      width,
      height,
      sizeBytes: output.size,
      previewUrl: URL.createObjectURL(output),
    };
  } finally {
    bitmap.close();
  }
}

/**
 * Reload the images of a stored turn so regenerate / edit-and-resend send the
 * same pictures again (the server deletes the original turn on truncation).
 */
export async function reloadAiImages(
  attachments: AiAttachmentView[] | undefined,
): Promise<AiOutgoingImage[] | null> {
  if (!attachments?.length) return [];
  try {
    return await Promise.all(
      attachments.map(async (attachment) => {
        const response = await fetch(attachment.previewUrl ?? aiChatAttachmentUrl(attachment.id));
        if (!response.ok) throw new Error(String(response.status));
        const blob = await response.blob();
        return {
          mediaType: attachment.mediaType,
          data: await blobToBase64(blob),
          width: attachment.width,
          height: attachment.height,
          sizeBytes: blob.size,
          previewUrl: URL.createObjectURL(blob),
        };
      }),
    );
  } catch {
    return null;
  }
}

/** Where a thumbnail loads from: the local preview first, then the store. */
export function aiAttachmentSrc(attachment: AiAttachmentView): string {
  return attachment.previewUrl ?? aiChatAttachmentUrl(attachment.id);
}
