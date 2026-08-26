import "server-only";

import { createDecipheriv, createHash, createHmac } from "node:crypto";
import { closeSync, fstatSync, openSync, readSync } from "node:fs";
import { resolve } from "node:path";

import { getBusinessEnvelopeKey } from "@/lib/business-truth/envelope-key";
import type { ServiceContext } from "@/lib/data/service-base";
import {
  type WhatsAppBinaryMediaKind,
  WhatsAppMediaObjectError,
  type WhatsAppMediaObjectReceipt,
  whatsAppMediaRoot,
} from "./media-object-store";

const OBJECT_MAGIC = Buffer.from("SFM1", "ascii");
const OBJECT_FORMAT_VERSION = 1;
const OBJECT_CHUNK_BYTES = 1024 * 1024;
const HEADER_BYTES = 9;
const FRAME_OVERHEAD_BYTES = 32;
const ID_PURPOSE = "sahelflow/whatsapp/media-object-id/v1";
const KEY_PURPOSE = "sahelflow/whatsapp/media-object-key/v1";
const CHUNK_AAD_PURPOSE = "sahelflow/whatsapp/media-object-chunk/v1";
const MEDIA_LIMITS: Readonly<Record<WhatsAppBinaryMediaKind, number>> = {
  image: 20 * 1024 * 1024,
  video: 64 * 1024 * 1024,
  audio: 32 * 1024 * 1024,
  document: 64 * 1024 * 1024,
  sticker: 4 * 1024 * 1024,
};

export interface WhatsAppMediaObjectProvenance {
  ciphertextSha256: string;
  ciphertextBytes: number;
}

export interface WhatsAppMediaPlaintextRange {
  start: number;
  end: number;
}

export interface OpenedWhatsAppMediaObject {
  /** Authenticated plaintext interval. The caller owns this Buffer and must wipe it. */
  bytes: Buffer;
  mediaType: string;
  provenance: WhatsAppMediaObjectProvenance;
}

function exactShopScope(context: ServiceContext): string {
  if (!context.shop) throw new Error("WhatsApp media requires exact ShopContext");
  return JSON.stringify([
    context.shop.workspaceId,
    context.shop.shopId,
    context.shop.shopIncarnationId,
  ]);
}

function deriveObjectId(
  context: ServiceContext,
  messageId: string,
  envelopeKey: Buffer,
): string {
  return createHmac("sha256", envelopeKey)
    .update(ID_PURPOSE, "utf8")
    .update("\0")
    .update(exactShopScope(context), "utf8")
    .update("\0")
    .update(messageId, "utf8")
    .digest("hex");
}

function deriveObjectKey(objectId: string, envelopeKey: Buffer): Buffer {
  return createHmac("sha256", envelopeKey)
    .update(KEY_PURPOSE, "utf8")
    .update("\0")
    .update(objectId, "utf8")
    .digest();
}

function chunkAad(
  objectId: string,
  kind: WhatsAppBinaryMediaKind,
  index: number,
  plaintextBytes: number,
): Buffer {
  return Buffer.from(
    JSON.stringify([
      CHUNK_AAD_PURPOSE,
      OBJECT_FORMAT_VERSION,
      objectId,
      kind,
      index,
      plaintextBytes,
    ]),
    "utf8",
  );
}

function sniffMediaType(
  kind: WhatsAppBinaryMediaKind,
  prefix: Buffer,
): string | null {
  const ascii4 = prefix.subarray(0, 4).toString("ascii");
  if (kind === "image" || kind === "sticker") {
    if (
      prefix.length >= 3 &&
      prefix[0] === 0xff &&
      prefix[1] === 0xd8 &&
      prefix[2] === 0xff
    ) {
      return "image/jpeg";
    }
    if (
      prefix
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    ) {
      return "image/png";
    }
    if (
      ascii4 === "RIFF" &&
      prefix.subarray(8, 12).toString("ascii") === "WEBP"
    ) {
      return "image/webp";
    }
    return null;
  }
  if (kind === "video") {
    return prefix.subarray(4, 8).toString("ascii") === "ftyp"
      ? "video/mp4"
      : null;
  }
  if (kind === "audio") {
    if (ascii4 === "OggS") return "audio/ogg";
    if (
      ascii4 === "RIFF" &&
      prefix.subarray(8, 12).toString("ascii") === "WAVE"
    ) {
      return "audio/wav";
    }
    if (
      prefix.subarray(0, 3).toString("ascii") === "ID3" ||
      (prefix.length >= 2 && prefix[0] === 0xff && (prefix[1]! & 0xe0) === 0xe0)
    ) {
      return "audio/mpeg";
    }
    if (prefix.subarray(0, 6).toString("ascii") === "#!AMR\n") {
      return "audio/amr";
    }
    if (
      prefix.length >= 2 &&
      prefix[0] === 0xff &&
      (prefix[1] === 0xf1 || prefix[1] === 0xf9)
    ) {
      return "audio/aac";
    }
    if (prefix.subarray(4, 8).toString("ascii") === "ftyp") {
      return "audio/mp4";
    }
    return null;
  }
  if (prefix.subarray(0, 5).toString("ascii") === "%PDF-") {
    return "application/pdf";
  }
  if (
    prefix
      .subarray(0, 4)
      .equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
  ) {
    return "application/zip";
  }
  if (
    prefix
      .subarray(0, 8)
      .equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))
  ) {
    return "application/x-ole-storage";
  }
  return "text/plain";
}

function expectedCiphertextBytes(receipt: WhatsAppMediaObjectReceipt): number {
  const value =
    HEADER_BYTES +
    receipt.sizeBytes +
    receipt.chunkCount * FRAME_OVERHEAD_BYTES;
  if (!Number.isSafeInteger(value) || value <= HEADER_BYTES) {
    throw new WhatsAppMediaObjectError(
      "Media object receipt has an invalid ciphertext size",
      "MEDIA_OBJECT_CORRUPT",
    );
  }
  return value;
}

function readExact(
  descriptor: number,
  length: number,
  position: number,
): Buffer {
  const output = Buffer.allocUnsafe(length);
  let offset = 0;
  try {
    while (offset < length) {
      const read = readSync(
        descriptor,
        output,
        offset,
        length - offset,
        position + offset,
      );
      if (read <= 0) {
        throw new WhatsAppMediaObjectError(
          "Media object ciphertext was truncated during read",
          "MEDIA_OBJECT_CORRUPT",
        );
      }
      offset += read;
    }
    return output;
  } catch (error) {
    output.fill(0);
    throw error;
  }
}

function normalizeRequestedRange(
  receipt: WhatsAppMediaObjectReceipt,
  requestedRange: WhatsAppMediaPlaintextRange | null,
): WhatsAppMediaPlaintextRange | null {
  if (!requestedRange) return null;
  const { start, end } = requestedRange;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    end < start ||
    end >= receipt.sizeBytes
  ) {
    throw new WhatsAppMediaObjectError(
      "Requested media range is outside the authenticated plaintext",
      "MEDIA_OBJECT_CORRUPT",
    );
  }
  return { start, end };
}

function authenticateOpenedObject(
  descriptor: number,
  kind: WhatsAppBinaryMediaKind,
  receipt: WhatsAppMediaObjectReceipt,
  objectKey: Buffer,
  requestedRange: WhatsAppMediaPlaintextRange | null,
): {
  bytes: Buffer | null;
  provenance: WhatsAppMediaObjectProvenance;
} {
  const limit = MEDIA_LIMITS[kind];
  const expectedBytes = expectedCiphertextBytes(receipt);
  if (
    receipt.sizeBytes <= 0 ||
    receipt.sizeBytes > limit ||
    receipt.chunkCount <= 0 ||
    receipt.chunkCount > Math.ceil(limit / OBJECT_CHUNK_BYTES)
  ) {
    throw new WhatsAppMediaObjectError(
      "Media object receipt exceeds the bounded read contract",
      "MEDIA_OBJECT_CORRUPT",
    );
  }

  const range = normalizeRequestedRange(receipt, requestedRange);
  const retained = range
    ? Buffer.allocUnsafe(range.end - range.start + 1)
    : null;
  let retainedBytes = 0;
  let prefix = Buffer.alloc(0);
  const plaintextHash = createHash("sha256");
  const ciphertextHash = createHash("sha256");
  let fileOffset = 0;
  let plaintextOffset = 0;
  let frameIndex = 0;

  try {
    const before = fstatSync(descriptor);
    if (!before.isFile() || before.size !== expectedBytes) {
      throw new WhatsAppMediaObjectError(
        "Media object ciphertext length does not match its receipt",
        "MEDIA_OBJECT_CORRUPT",
      );
    }

    const header = readExact(descriptor, HEADER_BYTES, fileOffset);
    try {
      ciphertextHash.update(header);
      if (
        !header.subarray(0, 4).equals(OBJECT_MAGIC) ||
        header.readUInt8(4) !== OBJECT_FORMAT_VERSION ||
        header.readUInt32LE(5) !== OBJECT_CHUNK_BYTES
      ) {
        throw new WhatsAppMediaObjectError(
          "Media object header is invalid",
          "MEDIA_OBJECT_CORRUPT",
        );
      }
    } finally {
      header.fill(0);
    }
    fileOffset += HEADER_BYTES;

    while (fileOffset < expectedBytes) {
      const frameHeader = readExact(
        descriptor,
        FRAME_OVERHEAD_BYTES,
        fileOffset,
      );
      let ciphertext: Buffer | null = null;
      let plaintext: Buffer | null = null;
      try {
        ciphertextHash.update(frameHeader);
        const plaintextBytes = frameHeader.readUInt32LE(0);
        const nonce = frameHeader.subarray(4, 16);
        const tag = frameHeader.subarray(16, 32);
        if (
          plaintextBytes === 0 ||
          plaintextBytes > OBJECT_CHUNK_BYTES ||
          plaintextOffset + plaintextBytes > limit ||
          fileOffset + FRAME_OVERHEAD_BYTES + plaintextBytes > expectedBytes
        ) {
          throw new WhatsAppMediaObjectError(
            "Media object frame length is invalid",
            "MEDIA_OBJECT_CORRUPT",
          );
        }

        ciphertext = readExact(
          descriptor,
          plaintextBytes,
          fileOffset + FRAME_OVERHEAD_BYTES,
        );
        ciphertextHash.update(ciphertext);

        const decipher = createDecipheriv("aes-256-gcm", objectKey, nonce);
        decipher.setAAD(
          chunkAad(receipt.objectId, kind, frameIndex, plaintextBytes),
        );
        decipher.setAuthTag(tag);
        try {
          plaintext = Buffer.concat([
            decipher.update(ciphertext),
            decipher.final(),
          ]);
        } catch {
          throw new WhatsAppMediaObjectError(
            "Media object authentication failed",
            "MEDIA_OBJECT_CORRUPT",
          );
        }
        if (plaintext.length !== plaintextBytes) {
          throw new WhatsAppMediaObjectError(
            "Media object plaintext frame length changed during authentication",
            "MEDIA_OBJECT_CORRUPT",
          );
        }

        if (prefix.length < 4096) {
          const nextPrefix = Buffer.concat([
            prefix,
            plaintext.subarray(0, 4096 - prefix.length),
          ]);
          prefix.fill(0);
          prefix = nextPrefix;
        }
        plaintextHash.update(plaintext);

        if (range && retained) {
          const frameStart = plaintextOffset;
          const frameEnd = plaintextOffset + plaintextBytes - 1;
          const overlapStart = Math.max(frameStart, range.start);
          const overlapEnd = Math.min(frameEnd, range.end);
          if (overlapStart <= overlapEnd) {
            const sourceStart = overlapStart - frameStart;
            const sourceEnd = overlapEnd - frameStart + 1;
            const copied = plaintext.copy(
              retained,
              overlapStart - range.start,
              sourceStart,
              sourceEnd,
            );
            retainedBytes += copied;
          }
        }

        plaintextOffset += plaintextBytes;
        frameIndex += 1;
        fileOffset += FRAME_OVERHEAD_BYTES + plaintextBytes;
      } finally {
        plaintext?.fill(0);
        ciphertext?.fill(0);
        frameHeader.fill(0);
      }
    }

    const after = fstatSync(descriptor);
    if (!after.isFile() || after.size !== expectedBytes) {
      throw new WhatsAppMediaObjectError(
        "Media object ciphertext changed during read",
        "MEDIA_OBJECT_CORRUPT",
      );
    }

    const mediaType = sniffMediaType(kind, prefix);
    if (
      !mediaType ||
      plaintextOffset !== receipt.sizeBytes ||
      frameIndex !== receipt.chunkCount ||
      plaintextHash.digest("hex") !== receipt.sha256 ||
      mediaType !== receipt.mediaType ||
      (retained && retainedBytes !== retained.length)
    ) {
      throw new WhatsAppMediaObjectError(
        "Media object integrity receipt does not match encrypted bytes",
        "MEDIA_OBJECT_CORRUPT",
      );
    }

    return {
      bytes: retained,
      provenance: {
        ciphertextSha256: ciphertextHash.digest("hex"),
        ciphertextBytes: expectedBytes,
      },
    };
  } catch (error) {
    retained?.fill(0);
    throw error;
  } finally {
    prefix.fill(0);
  }
}

async function authenticateMediaObject(
  context: ServiceContext,
  messageId: string,
  kind: WhatsAppBinaryMediaKind,
  receipt: WhatsAppMediaObjectReceipt,
  requestedRange: WhatsAppMediaPlaintextRange | null,
): Promise<{
  plaintext: Buffer | null;
  provenance: WhatsAppMediaObjectProvenance;
}> {
  const envelopeKey = await getBusinessEnvelopeKey(context);
  let descriptor: number | null = null;
  try {
    const expectedId = deriveObjectId(context, messageId, envelopeKey);
    if (receipt.objectId !== expectedId) {
      throw new WhatsAppMediaObjectError(
        "Media object identity is not bound to this message",
        "MEDIA_OBJECT_CORRUPT",
      );
    }
    const objectKey = deriveObjectKey(receipt.objectId, envelopeKey);
    try {
      const objectPath = resolve(
        whatsAppMediaRoot(context),
        `${receipt.objectId}.sfmedia`,
      );
      descriptor = openSync(objectPath, "r");
      const authenticated = authenticateOpenedObject(
        descriptor,
        kind,
        receipt,
        objectKey,
        requestedRange,
      );
      return {
        plaintext: authenticated.bytes,
        provenance: authenticated.provenance,
      };
    } catch (error) {
      if (error instanceof WhatsAppMediaObjectError) throw error;
      throw new WhatsAppMediaObjectError(
        "WhatsApp media object could not be read",
        "MEDIA_OBJECT_IO_FAILED",
      );
    } finally {
      if (descriptor !== null) closeSync(descriptor);
      objectKey.fill(0);
    }
  } finally {
    envelopeKey.fill(0);
  }
}

export async function verifyWhatsAppMediaObjectWithProvenance(
  context: ServiceContext,
  messageId: string,
  kind: WhatsAppBinaryMediaKind,
  receipt: WhatsAppMediaObjectReceipt,
): Promise<WhatsAppMediaObjectProvenance> {
  const authenticated = await authenticateMediaObject(
    context,
    messageId,
    kind,
    receipt,
    null,
  );
  return authenticated.provenance;
}

export async function readWhatsAppMediaObject(
  context: ServiceContext,
  messageId: string,
  kind: WhatsAppBinaryMediaKind,
  receipt: WhatsAppMediaObjectReceipt,
  range?: WhatsAppMediaPlaintextRange,
): Promise<OpenedWhatsAppMediaObject> {
  const requestedRange = range ?? {
    start: 0,
    end: receipt.sizeBytes - 1,
  };
  const authenticated = await authenticateMediaObject(
    context,
    messageId,
    kind,
    receipt,
    requestedRange,
  );
  if (!authenticated.plaintext) {
    throw new WhatsAppMediaObjectError(
      "Authenticated media read did not retain plaintext",
      "MEDIA_OBJECT_CORRUPT",
    );
  }
  return {
    bytes: authenticated.plaintext,
    mediaType: receipt.mediaType,
    provenance: authenticated.provenance,
  };
}
