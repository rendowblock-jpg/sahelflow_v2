process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import {
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { testAuthenticatedOwnerBusinessPrincipal } from "@/lib/business-truth/principal";
import { db, shopContext } from "@/lib/db";
import { coordinateShopEraseWithMedia } from "@/lib/privacy/erase-with-media";
import { whatsAppMediaErasePending } from "../media-erase-lifecycle";
import { whatsAppMediaRoot } from "../media-object-store";
import { queueWhatsAppImage } from "../outbound-image-queue";

const context = {
  prisma: db,
  shop: shopContext,
  businessPrincipal: testAuthenticatedOwnerBusinessPrincipal(
    "outbound-image-privacy-erase-test",
  ),
  whatsAppProviderAccountId: "213555999000:12@s.whatsapp.net",
};
const MESSAGE_ID = "44444444-4444-4444-8444-444444444444";
let testRoot = "";

function jpeg(payload = "privacy-erase-image"): Buffer {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
    Buffer.from("JFIF\0", "binary"),
    Buffer.from(payload, "utf8"),
    Buffer.from([0xff, 0xd9]),
  ]);
}

function stream(bytes: Buffer): ReadableStream<Uint8Array> {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  const body = new Response(copy).body;
  if (!body) throw new Error("ReadableStream unavailable");
  return body;
}

function heldStream(bytes: Buffer): {
  source: ReadableStream<Uint8Array>;
  started: Promise<void>;
  release: () => void;
} {
  let release!: () => void;
  let markStarted!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  const first = bytes.subarray(0, Math.min(16, bytes.length));
  const rest = bytes.subarray(first.length);
  let step = 0;
  return {
    release,
    started,
    source: new ReadableStream<Uint8Array>({
      async pull(controller) {
        if (step === 0) {
          controller.enqueue(first);
          step = 1;
          markStarted();
          return;
        }
        if (step === 1) {
          await gate;
          if (rest.length) controller.enqueue(rest);
          step = 2;
          controller.close();
        }
      },
    }),
  };
}

async function clean(): Promise<void> {
  await db.whatsAppOutboundEffect.deleteMany();
  await db.message.deleteMany();
  await db.conversation.deleteMany();
  await db.projectionInvalidation.deleteMany();
  await db.outboxIntent.deleteMany();
  await db.domainEvent.deleteMany();
  await db.businessCommand.deleteMany();
  await db.businessAggregateVersion.deleteMany();
  await db.auditLog.deleteMany();
}

async function eraseOnlyOwnedImageState(): Promise<{ mode: "privacy-erase" }> {
  const effect = await db.whatsAppOutboundEffect.findUnique({
    where: { messageId: MESSAGE_ID },
    select: { effectKey: true },
  });
  if (!effect) return { mode: "privacy-erase" };

  const message = await db.message.findUnique({
    where: { id: MESSAGE_ID },
    select: { conversationId: true },
  });
  await db.whatsAppOutboundEffect.deleteMany({
    where: { messageId: MESSAGE_ID },
  });
  await db.outboxIntent.deleteMany({
    where: { effectKey: effect.effectKey },
  });
  await db.message.deleteMany({ where: { id: MESSAGE_ID } });
  if (message) {
    await db.conversation.deleteMany({
      where: { id: message.conversationId },
    });
  }
  return { mode: "privacy-erase" };
}

beforeEach(async () => {
  await clean();
  testRoot = mkdtempSync(join(tmpdir(), "sahelflow-image-erase-race-"));
  process.env.SF_DATA_DIR = testRoot;
});

afterEach(async () => {
  rmSync(testRoot, { recursive: true, force: true });
  delete process.env.SF_DATA_DIR;
  await clean();
});

describe("outbound image queue vs privacy erase", () => {
  it("does not let erase cross image staging before the durable Message/outbox commit", async () => {
    const bytes = jpeg("queue-first-race");
    const held = heldStream(bytes);
    const mediaRoot = whatsAppMediaRoot(context);

    const queue = queueWhatsAppImage(context, {
      clientMessageId: MESSAGE_ID,
      to: "0555000111",
      caption: "Queue before erase",
      fileName: "queue-first.jpg",
      declaredMime: "image/jpeg",
      declaredSize: bytes.length,
      source: held.source,
    });

    // The first media read occurs only after the outbound queue owns the exact
    // shop lifecycle lease, so this is a deterministic concurrency boundary.
    await held.started;
    const erase = coordinateShopEraseWithMedia(
      context,
      eraseOnlyOwnedImageState,
    );
    await Promise.resolve();

    // Erase must remain queued behind the active image lifecycle operation; it
    // cannot tombstone the media tree while staging/DB commit is incomplete.
    expect(whatsAppMediaErasePending(mediaRoot)).toBe(false);

    held.release();
    const queued = await queue;
    await expect(erase).resolves.toEqual({ mode: "privacy-erase" });

    expect(await db.message.count({ where: { id: MESSAGE_ID } })).toBe(0);
    expect(
      await db.outboxIntent.count({ where: { effectKey: queued.effectKey } }),
    ).toBe(0);
    expect(
      await db.whatsAppOutboundEffect.count({
        where: { messageId: MESSAGE_ID },
      }),
    ).toBe(0);
    expect(existsSync(mediaRoot)).toBe(false);
    expect(existsSync(`${mediaRoot}.erasing`)).toBe(false);
  });

  it("queues a complete post-erase Message and encrypted media pair when erase owns the lease first", async () => {
    const mediaRoot = whatsAppMediaRoot(context);
    const erase = coordinateShopEraseWithMedia(
      context,
      eraseOnlyOwnedImageState,
    );
    const bytes = jpeg("erase-first-race");
    const queue = queueWhatsAppImage(context, {
      clientMessageId: MESSAGE_ID,
      to: "0555000111",
      caption: "Queue after erase",
      fileName: "erase-first.jpg",
      declaredMime: "image/jpeg",
      declaredSize: bytes.length,
      source: stream(bytes),
    });

    await expect(erase).resolves.toEqual({ mode: "privacy-erase" });
    const queued = await queue;

    await expect(
      db.message.findUniqueOrThrow({ where: { id: MESSAGE_ID } }),
    ).resolves.toMatchObject({
      direction: "outbound",
      messageType: "image",
      deliveryStatus: "sending",
      body: "Queue after erase",
    });
    expect(
      await db.outboxIntent.count({ where: { effectKey: queued.effectKey } }),
    ).toBe(1);
    expect(
      await db.whatsAppOutboundEffect.count({
        where: { messageId: MESSAGE_ID },
      }),
    ).toBe(1);
    expect(existsSync(mediaRoot)).toBe(true);
    expect(
      readdirSync(mediaRoot).filter((name) => name.endsWith(".sfmedia")),
    ).toHaveLength(1);
    expect(existsSync(`${mediaRoot}.erasing`)).toBe(false);
  });
});
