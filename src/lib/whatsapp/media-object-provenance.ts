import "server-only";

import { createDecipheriv, createHash, createHmac } from "node:crypto";
import {
  closeSync,
  fstatSync,
  openSync,
  readSync,
} from "node:fs";
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

export interface OpenedWhatsAppMediaObject {
  /** Authenticated plaintext. The caller owns this Buffer and must wipe it. */
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

/**
 * Read exactly the receipt-bounded ciphertext length from one already-open file
 * descriptor. This prevents a replaced/oversized local object from forcing an
 * unbounded allocation before cryptographic frame validation runs.
 */
function readBoundedCiphertext(path: string, expectedBytes: number): Buffer {
  const descriptor = openSync(path, "r");
  let output: Buffer | null = null;
  try {
    const before = fstatSync(descriptor);
    if (!before.isFile() || before.size !== expectedBytes) {
      throw new WhatsAppMediaObjectError(
        "Media object ciphertext length does not match its receipt",
        "MEDIA_OBJECT_CORRUPT",
      );
    }
    output = Buffer.allocUnsafe(expectedBytes);
    let offset = 0;
    while (offset < expectedBytes) {
      const read = readSync(
        descriptor,
        output,
        offset,
        expectedBytes - offset,
        offset,
      );
      if (read <= 0) {
        throw new WhatsAppMediaObjectError(
          "Media object ciphertext was truncated during read",
          "MEDIA_OBJECT_CORRUPT",
        );
      }
      offset += read;
    }
    const after = fstatSync(descriptor);
    if (!after.isFile() || after.size !== expectedBytes) {
      throw new WhatsAppMediaObjectError(
        "Media object ciphertext changed during read",
        "MEDIA_OBJECT_CORRUPT",
      );
    }
    const result = output;
    output = null;
    return result;
  } finally {
    output?.fill(0);
    closeSync(descriptor);
  }
}

/**
 * Authenticate exact object bytes. Read paths may retain the plaintext chunks;
 * provenance-only paths deliberately wipe each authenticated chunk immediately
 * so media-fetch completion never needs a second full plaintext copy in memory.
 */
function openExactObjectBytes(
  bytes: Buffer,
  objectId: string,
  kind: WhatsAppBinaryMediaKind,
  receipt: WhatsAppMediaObjectReceipt,
  objectKey: Buffer,
  retainPlaintext: boolean,
): Buffer | null {
  const limit = MEDIA_LIMITS[kind];
  if (
    receipt.sizeBytes <= 0 ||
    receipt.sizeBytes > limit ||
    receipt.chunkCount <= 0 ||
    receipt.chunkCount > Math.ceil(limit / OBJECT_CHUNK_BYTES) ||
    bytes.length !== expectedCiphertextBytes(receipt)
  ) {
    throw new WhatsAppMediaObjectError(
      "Media object receipt exceeds the bounded read contract",
      "MEDIA_OBJECT_CORRUPT",
    );
  }
  if (
    bytes.length < HEADER_BYTES ||
    !bytes.subarray(0, 4).equals(OBJECT_MAGIC) ||
    bytes.readUInt8(4) !== OBJECT_FORMAT_VERSION ||
    bytes.readUInt32LE(5) !== OBJECT_CHUNK_BYTES
  ) {
    throw new WhatsAppMediaObjectError(
      "Media object header is invalid",
      "MEDIA_OBJECT_CORRUPT",
    );
  }

  let offset = HEADER_BYTES;
  let index = 0;
  let total = 0;
  let prefix = Buffer.alloc(0);
  const plaintextHash = createHash("sha256");
  const retained: Buffer[] = [];
  try {
    while (offset < bytes.length) {
      if (offset + FRAME_OVERHEAD_BYTES > bytes.length) {
        throw new WhatsAppMediaObjectError(
          "Media object frame is truncated",
          "MEDIA_OBJECT_CORRUPT",
        );
      }
      const plaintextBytes = bytes.readUInt32LE(offset);
      const nonce = bytes.subarray(offset + 4, offset + 16);
      const tag = bytes.subarray(offset + 16, offset + 32);
      const ciphertextStart = offset + FRAME_OVERHEAD_BYTES;
      const ciphertextEnd = ciphertextStart + plaintextBytes;
      if (
        plaintextBytes === 0 ||
        plaintextBytes > OBJECT_CHUNK_BYTES ||
        ciphertextEnd > bytes.length ||
        total + plaintextBytes > limit
      ) {
        throw new WhatsAppMediaObjectError(
          "Media object frame length is invalid",
          "MEDIA_OBJECT_CORRUPT",
        );
      }

      const decipher = createDecipheriv("aes-256-gcm", objectKey, nonce);
      decipher.setAAD(chunkAad(objectId, kind, index, plaintextBytes));
      decipher.setAuthTag(tag);
      let plaintext: Buffer;
      try {
        plaintext = Buffer.concat([
          decipher.update(bytes.subarray(ciphertextStart, ciphertextEnd)),
          decipher.final(),
        ]);
      } catch {
        throw new WhatsAppMediaObjectError(
          "Media object authentication failed",
          "MEDIA_OBJECT_CORRUPT",
        );
      }
      if (plaintext.length !== plaintextBytes) {
        plaintext.fill(0);
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
      if (retainPlaintext) retained.push(plaintext);
      else plaintext.fill(0);
      total += plaintextBytes;
      index += 1;
      offset = ciphertextEnd;
    }

    const mediaType = sniffMediaType(kind, prefix);
    if (
      !mediaType ||
      total === 0 ||
      index !== receipt.chunkCount ||
      total !== receipt.sizeBytes ||
      plaintextHash.digest("hex") !== receipt.sha256 ||
      mediaType !== receipt.mediaType
    ) {
      throw new WhatsAppMediaObjectError(
        "Media object integrity receipt does not match encrypted bytes",
        "MEDIA_OBJECT_CORRUPT",
      );
    }
    if (!retainPlaintext) return null;
    const opened = Buffer.concat(retained, total);
    for (const chunk of retained) chunk.fill(0);
    retained.length = 0;
    return opened;
  } catch (error) {
    for (const chunk of retained) chunk.fill(0);
    throw error;
  } finally {
    prefix.fill(0);
  }
}

function ciphertextProvenance(bytes: Buffer): WhatsAppMediaObjectProvenance {
  return {
    ciphertextSha256: createHash("sha256").update(bytes).digest("hex"),
    ciphertextBytes: bytes.length,
  };
}

async function authenticateMediaObject(
  context: ServiceContext,
  messageId: string,
  kind: WhatsAppBinaryMediaKind,
  receipt: WhatsAppMediaObjectReceipt,
  retainPlaintext: boolean,
): Promise<{ plaintext: Buffer | null; provenance: WhatsAppMediaObjectProvenance }> {
  const envelopeKey = await getBusinessEnvelopeKey(context);
  try {
    const expectedId = deriveObjectId(context, messageId, envelopeKey);
    if (receipt.objectId !== expectedId) {
      throw new WhatsAppMediaObjectError(
        "Media object identity is not bound to this message",
        "MEDIA_OBJECT_CORRUPT",
      );
    }
    const objectKey = deriveObjectKey(receipt.objectId, envelopeKey);
    const objectPath = resolve(
      whatsAppMediaRoot(context),
      `${receipt.objectId}.sfmedia`,
    );
    const ciphertext = readBoundedCiphertext(
      objectPath,
      expectedCiphertextBytes(receipt),
    );
    try {
      const plaintext = openExactObjectBytes(
        ciphertext,
        receipt.objectId,
        kind,
        receipt,
        objectKey,
        retainPlaintext,
      );
      return {
        plaintext,
        provenance: ciphertextProvenance(ciphertext),
      };
    } finally {
      ciphertext.fill(0);
      objectKey.fill(0);
    }
  } finally {
    envelopeKey.fill(0);
  }
}

/**
 * Read the object once, authenticate every GCM frame from that immutable Buffer,
 * and only then return provenance for those exact bytes. This intentionally does
 * not trust a path-level verify/read/verify sequence, which can be raced by a
 * same-name filesystem replacement between independent opens.
 */
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
    false,
  );
  return authenticated.provenance;
}

/**
 * Open one canonical media object for an authenticated seller read. Plaintext
 * exists only in memory, is bounded by the same per-kind limits as ingestion,
 * and is returned only after every GCM frame plus the encrypted integrity
 * receipt has been verified against the exact message/shop identity.
 *
 * The caller owns `bytes` and must wipe it after copying the response payload.
 */
export async function readWhatsAppMediaObject(
  context: ServiceContext,
  messageId: string,
  kind: WhatsAppBinaryMediaKind,
  receipt: WhatsAppMediaObjectReceipt,
): Promise<OpenedWhatsAppMediaObject> {
  const authenticated = await authenticateMediaObject(
    context,
    messageId,
    kind,
    receipt,
    true,
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
