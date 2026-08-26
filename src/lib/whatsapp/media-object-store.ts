import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from "node:crypto";
import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeSync,
} from "node:fs";
import { basename, dirname, resolve } from "node:path";

import { getBusinessEnvelopeKey } from "@/lib/business-truth/envelope-key";
import type { ServiceContext } from "@/lib/data/service-base";

export type WhatsAppBinaryMediaKind =
  | "image"
  | "video"
  | "audio"
  | "document"
  | "sticker";

const MEDIA_LIMITS: Readonly<Record<WhatsAppBinaryMediaKind, number>> = {
  image: 20 * 1024 * 1024,
  video: 64 * 1024 * 1024,
  audio: 32 * 1024 * 1024,
  document: 64 * 1024 * 1024,
  sticker: 4 * 1024 * 1024,
};
const OBJECT_MAGIC = Buffer.from("SFM1", "ascii");
const OBJECT_FORMAT_VERSION = 1;
const OBJECT_CHUNK_BYTES = 1024 * 1024;
const HEADER_BYTES = 9;
const ID_PURPOSE = "sahelflow/whatsapp/media-object-id/v1";
const KEY_PURPOSE = "sahelflow/whatsapp/media-object-key/v1";
const CHUNK_AAD_PURPOSE = "sahelflow/whatsapp/media-object-chunk/v1";

export class WhatsAppMediaObjectError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "MEDIA_SIZE_LIMIT"
      | "MEDIA_CONTENT_TYPE_MISMATCH"
      | "MEDIA_OBJECT_CORRUPT"
      | "MEDIA_OBJECT_IO_FAILED",
  ) {
    super(message);
    this.name = "WhatsAppMediaObjectError";
  }
}

export interface WhatsAppMediaObjectReceipt {
  formatVersion: 1;
  objectId: string;
  sha256: string;
  sizeBytes: number;
  chunkCount: number;
  mediaType: string;
}

/**
 * Business-media identity survives a legitimate replacement install. The
 * installation ID protects local key wrapping/runtime authority, while durable
 * seller content remains bound to workspace + shop + shop incarnation.
 */
function exactShopScope(context: ServiceContext): string {
  if (!context.shop) throw new Error("WhatsApp media requires exact ShopContext");
  return JSON.stringify([
    context.shop.workspaceId,
    context.shop.shopId,
    context.shop.shopIncarnationId,
  ]);
}

function dataRoot(): string {
  const configured = process.env.SF_DATA_DIR;
  if (configured) return resolve(configured);

  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl?.startsWith("file:")) {
    const databasePath = resolve(databaseUrl.slice("file:".length));
    const databaseDirectory = dirname(databasePath);
    if (basename(databaseDirectory).toLowerCase() === "shops") {
      return dirname(databaseDirectory);
    }
  }
  return resolve(process.cwd(), "data");
}

function scopeDirectory(context: ServiceContext): string {
  const scope = createHash("sha256")
    .update("sahelflow/whatsapp/media-scope/v1\0", "utf8")
    .update(exactShopScope(context), "utf8")
    .digest("hex");
  return resolve(dataRoot(), "whatsapp-media", scope);
}

export function whatsAppMediaRoot(context: ServiceContext): string {
  return scopeDirectory(context);
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

function objectPath(context: ServiceContext, objectId: string): string {
  if (!/^[0-9a-f]{64}$/.test(objectId)) throw new Error("Invalid media object ID");
  return resolve(scopeDirectory(context), `${objectId}.sfmedia`);
}

function ensureDirectory(path: string): void {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  try {
    chmodSync(path, 0o700);
  } catch {
    // Windows ACLs remain authoritative when POSIX chmod is unavailable.
  }
}

function syncDirectory(path: string): void {
  if (process.platform === "win32") return;
  const descriptor = openSync(path, "r");
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
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

function normalizedMime(value: string | null): string | null {
  if (!value) return null;
  return value.split(";", 1)[0]?.trim().toLowerCase() || null;
}

function sniffMediaType(
  kind: WhatsAppBinaryMediaKind,
  prefix: Buffer,
): string | null {
  const ascii4 = prefix.subarray(0, 4).toString("ascii");
  if (kind === "image" || kind === "sticker") {
    if (prefix.length >= 3 && prefix[0] === 0xff && prefix[1] === 0xd8 && prefix[2] === 0xff) return "image/jpeg";
    if (prefix.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
    if (ascii4 === "RIFF" && prefix.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
    return null;
  }
  if (kind === "video") {
    return prefix.subarray(4, 8).toString("ascii") === "ftyp" ? "video/mp4" : null;
  }
  if (kind === "audio") {
    if (ascii4 === "OggS") return "audio/ogg";
    if (ascii4 === "RIFF" && prefix.subarray(8, 12).toString("ascii") === "WAVE") return "audio/wav";
    if (prefix.subarray(0, 3).toString("ascii") === "ID3" || (prefix.length >= 2 && prefix[0] === 0xff && (prefix[1]! & 0xe0) === 0xe0)) return "audio/mpeg";
    if (prefix.subarray(0, 6).toString("ascii") === "#!AMR\n") return "audio/amr";
    if (prefix.length >= 2 && prefix[0] === 0xff && (prefix[1] === 0xf1 || prefix[1] === 0xf9)) return "audio/aac";
    if (prefix.subarray(4, 8).toString("ascii") === "ftyp") return "audio/mp4";
    return null;
  }
  if (prefix.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf";
  if (prefix.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) return "application/zip";
  if (prefix.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))) return "application/x-ole-storage";
  return "text/plain";
}

function contentMatchesDeclared(
  kind: WhatsAppBinaryMediaKind,
  sniffed: string,
  declaredMime: string | null,
): boolean {
  const declared = normalizedMime(declaredMime);
  if (!declared) return true;
  if (kind === "video") return sniffed === "video/mp4" && declared.startsWith("video/");
  if (kind === "audio") {
    if (declared === "audio/opus") return sniffed === "audio/ogg";
    if (declared === "audio/x-wav") return sniffed === "audio/wav";
    return sniffed === declared;
  }
  if (kind === "document") {
    if (sniffed === "application/zip") {
      return declared === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || declared === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    }
    if (sniffed === "application/x-ole-storage") {
      return declared === "application/msword" || declared === "application/vnd.ms-excel";
    }
    if (sniffed === "text/plain") return declared === "text/plain" || declared === "text/csv";
  }
  return sniffed === declared;
}

function assertSafeTextChunk(decoder: TextDecoder, bytes: Buffer): void {
  for (const byte of bytes) {
    if (byte === 0x7f || (byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d)) {
      throw new WhatsAppMediaObjectError("Text document contains binary control bytes", "MEDIA_CONTENT_TYPE_MISMATCH");
    }
  }
  try {
    decoder.decode(bytes, { stream: true });
  } catch {
    throw new WhatsAppMediaObjectError("Text document is not valid UTF-8", "MEDIA_CONTENT_TYPE_MISMATCH");
  }
}

function writeAll(descriptor: number, bytes: Buffer): void {
  let offset = 0;
  while (offset < bytes.length) {
    offset += writeSync(descriptor, bytes, offset, bytes.length - offset);
  }
}

function inspectObjectBytes(
  bytes: Buffer,
  objectId: string,
  kind: WhatsAppBinaryMediaKind,
  objectKey: Buffer,
): Omit<WhatsAppMediaObjectReceipt, "formatVersion" | "objectId"> {
  if (bytes.length < HEADER_BYTES || !bytes.subarray(0, 4).equals(OBJECT_MAGIC) || bytes.readUInt8(4) !== OBJECT_FORMAT_VERSION || bytes.readUInt32LE(5) !== OBJECT_CHUNK_BYTES) {
    throw new WhatsAppMediaObjectError("Media object header is invalid", "MEDIA_OBJECT_CORRUPT");
  }
  let offset = HEADER_BYTES;
  let index = 0;
  let total = 0;
  let prefix = Buffer.alloc(0);
  const hash = createHash("sha256");
  while (offset < bytes.length) {
    if (offset + 32 > bytes.length) throw new WhatsAppMediaObjectError("Media object frame is truncated", "MEDIA_OBJECT_CORRUPT");
    const plaintextBytes = bytes.readUInt32LE(offset);
    const nonce = bytes.subarray(offset + 4, offset + 16);
    const tag = bytes.subarray(offset + 16, offset + 32);
    const ciphertextStart = offset + 32;
    const ciphertextEnd = ciphertextStart + plaintextBytes;
    if (plaintextBytes === 0 || plaintextBytes > OBJECT_CHUNK_BYTES || ciphertextEnd > bytes.length) throw new WhatsAppMediaObjectError("Media object frame length is invalid", "MEDIA_OBJECT_CORRUPT");
    const decipher = createDecipheriv("aes-256-gcm", objectKey, nonce);
    decipher.setAAD(chunkAad(objectId, kind, index, plaintextBytes));
    decipher.setAuthTag(tag);
    let plaintext: Buffer;
    try {
      plaintext = Buffer.concat([decipher.update(bytes.subarray(ciphertextStart, ciphertextEnd)), decipher.final()]);
    } catch {
      throw new WhatsAppMediaObjectError("Media object authentication failed", "MEDIA_OBJECT_CORRUPT");
    }
    if (prefix.length < 4096) prefix = Buffer.concat([prefix, plaintext.subarray(0, 4096 - prefix.length)]);
    hash.update(plaintext);
    total += plaintext.length;
    plaintext.fill(0);
    index += 1;
    offset = ciphertextEnd;
  }
  const mediaType = sniffMediaType(kind, prefix);
  prefix.fill(0);
  if (!mediaType || total === 0) throw new WhatsAppMediaObjectError("Media object has no valid content", "MEDIA_OBJECT_CORRUPT");
  return { sha256: hash.digest("hex"), sizeBytes: total, chunkCount: index, mediaType };
}

async function inspectExistingObject(
  context: ServiceContext,
  messageId: string,
  kind: WhatsAppBinaryMediaKind,
  declaredSize: number | null,
  declaredMime: string | null,
  envelopeKey: Buffer,
): Promise<WhatsAppMediaObjectReceipt | null> {
  const objectId = deriveObjectId(context, messageId, envelopeKey);
  const target = objectPath(context, objectId);
  if (!existsSync(target)) return null;
  const objectKey = deriveObjectKey(objectId, envelopeKey);
  try {
    const stats = inspectObjectBytes(readFileSync(target), objectId, kind, objectKey);
    if ((declaredSize !== null && stats.sizeBytes !== declaredSize) || !contentMatchesDeclared(kind, stats.mediaType, declaredMime)) {
      throw new WhatsAppMediaObjectError("Existing media object disagrees with canonical metadata", "MEDIA_OBJECT_CORRUPT");
    }
    return { formatVersion: 1, objectId, ...stats };
  } finally {
    objectKey.fill(0);
  }
}

async function writeEncryptedChunks(
  descriptor: number,
  objectId: string,
  kind: WhatsAppBinaryMediaKind,
  objectKey: Buffer,
  source: ReadableStream<Uint8Array>,
  declaredSize: number | null,
  declaredMime: string | null,
): Promise<Omit<WhatsAppMediaObjectReceipt, "formatVersion" | "objectId">> {
  const reader = source.getReader();
  const hash = createHash("sha256");
  let pending = Buffer.alloc(0);
  let total = 0;
  let chunkCount = 0;
  let sniffed: string | null = null;
  const textDecoder = new TextDecoder("utf-8", { fatal: true });
  const limit = MEDIA_LIMITS[kind];

  const encryptChunk = (plaintext: Buffer) => {
    if (sniffed === "text/plain") {
      assertSafeTextChunk(textDecoder, plaintext);
    }
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", objectKey, nonce);
    cipher.setAAD(chunkAad(objectId, kind, chunkCount, plaintext.length));
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    const frame = Buffer.allocUnsafe(4 + nonce.length + tag.length + ciphertext.length);
    frame.writeUInt32LE(plaintext.length, 0);
    nonce.copy(frame, 4);
    tag.copy(frame, 16);
    ciphertext.copy(frame, 32);
    writeAll(descriptor, frame);
    hash.update(plaintext);
    total += plaintext.length;
    chunkCount += 1;
    plaintext.fill(0);
  };

  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      const incoming = Buffer.from(next.value);
      if (total + pending.length + incoming.length > limit) {
        throw new WhatsAppMediaObjectError("WhatsApp media exceeds the bounded byte ceiling", "MEDIA_SIZE_LIMIT");
      }
      pending = pending.length ? Buffer.concat([pending, incoming]) : incoming;
      if (!sniffed && pending.length >= 16) {
        sniffed = sniffMediaType(kind, pending.subarray(0, Math.min(pending.length, 4096)));
        if (!sniffed || !contentMatchesDeclared(kind, sniffed, declaredMime)) {
          throw new WhatsAppMediaObjectError("WhatsApp media content does not match its safe declared type", "MEDIA_CONTENT_TYPE_MISMATCH");
        }
      }
      while (pending.length >= OBJECT_CHUNK_BYTES) {
        const plaintext = Buffer.from(pending.subarray(0, OBJECT_CHUNK_BYTES));
        pending = Buffer.from(pending.subarray(OBJECT_CHUNK_BYTES));
        encryptChunk(plaintext);
      }
    }
    if (!sniffed) {
      sniffed = sniffMediaType(kind, pending.subarray(0, Math.min(pending.length, 4096)));
      if (!sniffed || !contentMatchesDeclared(kind, sniffed, declaredMime)) {
        throw new WhatsAppMediaObjectError("WhatsApp media content does not match its safe declared type", "MEDIA_CONTENT_TYPE_MISMATCH");
      }
    }
    if (pending.length) encryptChunk(Buffer.from(pending));
    if (sniffed === "text/plain") {
      try {
        textDecoder.decode();
      } catch {
        throw new WhatsAppMediaObjectError("Text document ended with invalid UTF-8", "MEDIA_CONTENT_TYPE_MISMATCH");
      }
    }
    if (total === 0 || (declaredSize !== null && total !== declaredSize)) {
      throw new WhatsAppMediaObjectError("WhatsApp media byte count disagrees with provider metadata", "MEDIA_SIZE_LIMIT");
    }
    return { sha256: hash.digest("hex"), sizeBytes: total, chunkCount, mediaType: sniffed };
  } finally {
    pending.fill(0);
    await reader.cancel().catch(() => undefined);
  }
}

export async function writeWhatsAppMediaObject(
  context: ServiceContext,
  input: {
    messageId: string;
    kind: WhatsAppBinaryMediaKind;
    declaredSize: number | null;
    declaredMime: string | null;
    source: ReadableStream<Uint8Array>;
  },
): Promise<WhatsAppMediaObjectReceipt> {
  const envelopeKey = await getBusinessEnvelopeKey(context);
  try {
    const reusable = await inspectExistingObject(
      context,
      input.messageId,
      input.kind,
      input.declaredSize,
      input.declaredMime,
      envelopeKey,
    );
    if (reusable) {
      await input.source.cancel().catch(() => undefined);
      return reusable;
    }
    const objectId = deriveObjectId(context, input.messageId, envelopeKey);
    const objectKey = deriveObjectKey(objectId, envelopeKey);
    const directory = scopeDirectory(context);
    ensureDirectory(directory);
    const target = objectPath(context, objectId);
    const temporary = resolve(directory, `.${objectId}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`);
    const descriptor = openSync(temporary, "wx", 0o600);
    let closed = false;
    try {
      const header = Buffer.alloc(HEADER_BYTES);
      OBJECT_MAGIC.copy(header, 0);
      header.writeUInt8(OBJECT_FORMAT_VERSION, 4);
      header.writeUInt32LE(OBJECT_CHUNK_BYTES, 5);
      writeAll(descriptor, header);
      const stats = await writeEncryptedChunks(
        descriptor,
        objectId,
        input.kind,
        objectKey,
        input.source,
        input.declaredSize,
        input.declaredMime,
      );
      fsyncSync(descriptor);
      closeSync(descriptor);
      closed = true;
      renameSync(temporary, target);
      syncDirectory(directory);
      try {
        chmodSync(target, 0o600);
      } catch {
        // Windows ACLs remain authoritative when POSIX chmod is unavailable.
      }
      return { formatVersion: 1, objectId, ...stats };
    } catch (error) {
      if (!closed) {
        try {
          closeSync(descriptor);
        } catch {
          // already closed
        }
      }
      rmSync(temporary, { force: true });
      throw error instanceof WhatsAppMediaObjectError
        ? error
        : new WhatsAppMediaObjectError("WhatsApp media object could not be committed", "MEDIA_OBJECT_IO_FAILED");
    } finally {
      objectKey.fill(0);
    }
  } finally {
    envelopeKey.fill(0);
  }
}

export async function verifyWhatsAppMediaObject(
  context: ServiceContext,
  messageId: string,
  kind: WhatsAppBinaryMediaKind,
  receipt: WhatsAppMediaObjectReceipt,
): Promise<void> {
  const envelopeKey = await getBusinessEnvelopeKey(context);
  try {
    const expectedId = deriveObjectId(context, messageId, envelopeKey);
    if (receipt.objectId !== expectedId) {
      throw new WhatsAppMediaObjectError("Media object identity is not bound to this message", "MEDIA_OBJECT_CORRUPT");
    }
    const objectKey = deriveObjectKey(receipt.objectId, envelopeKey);
    try {
      const stats = inspectObjectBytes(readFileSync(objectPath(context, receipt.objectId)), receipt.objectId, kind, objectKey);
      if (stats.chunkCount !== receipt.chunkCount || stats.sizeBytes !== receipt.sizeBytes || stats.sha256 !== receipt.sha256 || stats.mediaType !== receipt.mediaType) {
        throw new WhatsAppMediaObjectError("Media object integrity receipt does not match encrypted bytes", "MEDIA_OBJECT_CORRUPT");
      }
    } finally {
      objectKey.fill(0);
    }
  } finally {
    envelopeKey.fill(0);
  }
}

export async function removeWhatsAppMediaRoot(context: ServiceContext): Promise<void> {
  rmSync(scopeDirectory(context), { recursive: true, force: true });
}
