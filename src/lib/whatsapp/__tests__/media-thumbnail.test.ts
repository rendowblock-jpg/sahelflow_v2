process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef";

import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import sharp from "sharp";

import { db, shopContext } from "@/lib/db";
import {
  WHATSAPP_THUMBNAIL_BYTE_CEILING,
  readWhatsAppMediaObjectThumbnail,
  removeWhatsAppMediaRoot,
  writeWhatsAppMediaObjectThumbnail,
} from "../media-object-store";
import { deriveWhatsAppThumbnail } from "../media-thumbnail";

const context = { prisma: db, shop: shopContext } as const;
let testRoot = "";

function stream(bytes: Buffer): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

async function realJpeg(width = 1600, height = 1200): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 40, g: 120, b: 90 },
    },
  })
    .jpeg()
    .toBuffer();
}

beforeEach(() => {
  testRoot = mkdtempSync(join(tmpdir(), "sahelflow-media-thumbnail-"));
  process.env.SF_DATA_DIR = testRoot;
});

afterEach(async () => {
  await removeWhatsAppMediaRoot(context).catch(() => undefined);
  rmSync(testRoot, { recursive: true, force: true });
  delete process.env.SF_DATA_DIR;
});

describe("bounded WhatsApp thumbnail derivation", () => {
  it("derives a bounded JPEG projection from canonical image bytes", async () => {
    const canonical = await realJpeg();
    const thumbnail = await deriveWhatsAppThumbnail(canonical);
    expect(thumbnail).not.toBeNull();
    expect(thumbnail!.byteLength).toBeLessThanOrEqual(
      WHATSAPP_THUMBNAIL_BYTE_CEILING,
    );
    const meta = await sharp(thumbnail!).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBeLessThanOrEqual(512);
    expect(meta.height).toBeLessThanOrEqual(512);
  });

  it("returns null for non-image bytes without throwing", async () => {
    await expect(
      deriveWhatsAppThumbnail(Buffer.from("definitely not an image")),
    ).resolves.toBeNull();
  });
});

describe("encrypted thumbnail variant objects", () => {
  it("round-trips an authenticated thumbnail and reuses it on replay", async () => {
    const messageId = randomUUID();
    const canonical = await realJpeg(1024, 768);
    const thumbnail = (await deriveWhatsAppThumbnail(canonical))!;
    const first = await writeWhatsAppMediaObjectThumbnail(context, {
      messageId,
      source: stream(thumbnail),
    });
    expect(first.mediaType).toBe("image/jpeg");
    expect(first.sizeBytes).toBe(thumbnail.byteLength);

    const opened = await readWhatsAppMediaObjectThumbnail(context, messageId);
    expect(opened.bytes.equals(thumbnail)).toBe(true);
    expect(opened.receipt.objectId).toBe(first.objectId);

    // Idempotent replay with the identical bytes reuses the same object.
    const replay = await writeWhatsAppMediaObjectThumbnail(context, {
      messageId,
      source: stream(thumbnail),
    });
    expect(replay.objectId).toBe(first.objectId);
  });

  it("rejects a conflicting variant bound to the same message identity", async () => {
    const messageId = randomUUID();
    const canonical = await realJpeg(900, 900);
    const original = (await deriveWhatsAppThumbnail(canonical))!;
    await writeWhatsAppMediaObjectThumbnail(context, {
      messageId,
      source: stream(original),
    });
    const conflicting = await sharp({
      create: { width: 64, height: 64, channels: 3, background: { r: 255, g: 0, b: 0 } },
    })
      .jpeg()
      .toBuffer();
    await expect(
      writeWhatsAppMediaObjectThumbnail(context, {
        messageId,
        source: stream(conflicting),
      }),
    ).rejects.toMatchObject({ code: "MEDIA_OBJECT_CONFLICT" });
  });

  it("enforces the store-level thumbnail byte ceiling", async () => {
    const messageId = randomUUID();
    const oversized = Buffer.alloc(WHATSAPP_THUMBNAIL_BYTE_CEILING + 1, 7);
    // Oversized bytes still need a JPEG-ish header to reach the ceiling check
    // deterministically; the store guard runs before content sniffing.
    oversized[0] = 0xff;
    oversized[1] = 0xd8;
    await expect(
      writeWhatsAppMediaObjectThumbnail(context, {
        messageId,
        source: stream(oversized),
      }),
    ).rejects.toMatchObject({ code: "MEDIA_SIZE_LIMIT" });
  });

  it("fails closed with not-available when no thumbnail exists", async () => {
    await expect(
      readWhatsAppMediaObjectThumbnail(context, randomUUID()),
    ).rejects.toMatchObject({ code: "MEDIA_OBJECT_NOT_FOUND" });
  });
});
