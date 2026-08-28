import "server-only";

import sharp from "sharp";

import { WHATSAPP_THUMBNAIL_BYTE_CEILING } from "./media-object-store";

const THUMBNAIL_MAX_EDGE = 512;
// Quality ladder keeps the derived variant inside the store ceiling without
// ever returning oversized bytes to a caller.
const QUALITY_LADDER = [80, 64, 50, 38] as const;

/**
 * Derive one bounded authenticated JPEG thumbnail from canonical image bytes
 * (#317). The result is a derived projection only: canonical bytes stay the
 * sole authority, failures return null (callers proceed without a thumbnail)
 * and no plaintext is ever cached to disk.
 */
export async function deriveWhatsAppThumbnail(
  bytes: Buffer,
): Promise<Buffer | null> {
  if (bytes.byteLength <= 0) return null;
  try {
    const source = sharp(bytes, { failOn: "none" }).rotate();
    const metadata = await source.metadata();
    if (
      !metadata.format ||
      !["jpeg", "png", "webp", "gif", "tiff", "avif"].includes(metadata.format)
    ) {
      return null;
    }
    const resized = source.resize(THUMBNAIL_MAX_EDGE, THUMBNAIL_MAX_EDGE, {
      fit: "inside",
      withoutEnlargement: true,
    });
    for (const quality of QUALITY_LADDER) {
      const candidate = await resized
        .clone()
        .jpeg({ quality })
        .toBuffer();
      if (candidate.byteLength <= WHATSAPP_THUMBNAIL_BYTE_CEILING) {
        return candidate;
      }
    }
    const smallest = await sharp(bytes, { failOn: "none" })
      .rotate()
      .resize(256, 256, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 30 })
      .toBuffer();
    return smallest.byteLength <= WHATSAPP_THUMBNAIL_BYTE_CEILING ? smallest : null;
  } catch {
    // Unsupported or corrupt input: the canonical object remains fully usable.
    return null;
  }
}
