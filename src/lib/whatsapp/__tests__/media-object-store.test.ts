process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { randomUUID } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { db, shopContext } from "@/lib/db";
import {
  removeWhatsAppMediaRoot,
  verifyWhatsAppMediaObject,
  whatsAppMediaRoot,
  writeWhatsAppMediaObject,
} from "../media-object-store";

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

function jpeg(marker = "customer-media-secret"): Buffer {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
    Buffer.from("JFIF\0", "binary"),
    Buffer.from(marker, "utf8"),
    Buffer.from([0xff, 0xd9]),
  ]);
}

beforeEach(() => {
  testRoot = mkdtempSync(join(tmpdir(), "sahelflow-media-object-"));
  process.env.SF_DATA_DIR = testRoot;
});

afterEach(async () => {
  await removeWhatsAppMediaRoot(context).catch(() => undefined);
  rmSync(testRoot, { recursive: true, force: true });
  delete process.env.SF_DATA_DIR;
});

describe("WhatsApp encrypted media objects", () => {
  it("commits authenticated ciphertext without plaintext markers", async () => {
    const bytes = jpeg();
    const messageId = randomUUID();
    const receipt = await writeWhatsAppMediaObject(context, {
      messageId,
      kind: "image",
      declaredSize: bytes.length,
      declaredMime: "image/jpeg",
      source: stream(bytes),
    });

    expect(receipt).toMatchObject({
      formatVersion: 1,
      sizeBytes: bytes.length,
      mediaType: "image/jpeg",
      chunkCount: 1,
    });
    await expect(
      verifyWhatsAppMediaObject(context, messageId, "image", receipt),
    ).resolves.toBeUndefined();

    const files = readdirSync(whatsAppMediaRoot(context));
    expect(files).toHaveLength(1);
    const stored = readFileSync(join(whatsAppMediaRoot(context), files[0]!));
    expect(stored.includes(Buffer.from("customer-media-secret", "utf8"))).toBe(false);
    expect(stored.equals(bytes)).toBe(false);
  });

  it("reuses an authenticated deterministic object after a post-rename crash", async () => {
    const bytes = jpeg("first-provider-copy");
    const messageId = randomUUID();
    const first = await writeWhatsAppMediaObject(context, {
      messageId,
      kind: "image",
      declaredSize: bytes.length,
      declaredMime: "image/jpeg",
      source: stream(bytes),
    });
    const alternate = jpeg("second-provider-cop");
    expect(alternate.length).toBe(bytes.length);

    const replay = await writeWhatsAppMediaObject(context, {
      messageId,
      kind: "image",
      declaredSize: bytes.length,
      declaredMime: "image/jpeg",
      source: stream(alternate),
    });

    expect(replay).toEqual(first);
    expect(readdirSync(whatsAppMediaRoot(context))).toHaveLength(1);
  });

  it("fails closed on ciphertext tampering", async () => {
    const bytes = jpeg();
    const messageId = randomUUID();
    const receipt = await writeWhatsAppMediaObject(context, {
      messageId,
      kind: "image",
      declaredSize: bytes.length,
      declaredMime: "image/jpeg",
      source: stream(bytes),
    });
    const file = join(
      whatsAppMediaRoot(context),
      readdirSync(whatsAppMediaRoot(context))[0]!,
    );
    const tampered = readFileSync(file);
    const lastIndex = tampered.length - 1;
    tampered[lastIndex] = tampered[lastIndex]! ^ 0x01;
    writeFileSync(file, tampered);

    await expect(
      verifyWhatsAppMediaObject(context, messageId, "image", receipt),
    ).rejects.toMatchObject({ code: "MEDIA_OBJECT_CORRUPT" });
  });

  it("rejects actual byte counts or content that disagree with metadata", async () => {
    const bytes = jpeg();
    await expect(
      writeWhatsAppMediaObject(context, {
        messageId: randomUUID(),
        kind: "image",
        declaredSize: bytes.length + 1,
        declaredMime: "image/jpeg",
        source: stream(bytes),
      }),
    ).rejects.toMatchObject({ code: "MEDIA_SIZE_LIMIT" });

    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from("not-a-jpeg", "utf8"),
    ]);
    await expect(
      writeWhatsAppMediaObject(context, {
        messageId: randomUUID(),
        kind: "image",
        declaredSize: png.length,
        declaredMime: "image/jpeg",
        source: stream(png),
      }),
    ).rejects.toMatchObject({ code: "MEDIA_CONTENT_TYPE_MISMATCH" });
  });
});
