process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { testAuthenticatedOwnerBusinessPrincipal } from "@/lib/business-truth/principal";
import { db, shopContext } from "@/lib/db";
import {
  processWhatsAppEffect,
  queueWhatsAppImage,
} from "../durable-send";
import {
  removeWhatsAppMediaRoot,
  whatsAppMediaRoot,
} from "../media-object-store";
import { openInboxWhatsAppMedia } from "../media-read-service";
import { SidecarRequestError } from "../sidecar-client";

const context = {
  prisma: db,
  shop: shopContext,
  businessPrincipal: testAuthenticatedOwnerBusinessPrincipal(
    "outbound-image-test-session",
  ),
  whatsAppProviderAccountId: "213555999000:12@s.whatsapp.net",
};
const MESSAGE_ID = "22222222-2222-4222-8222-222222222222";
let testRoot = "";

function jpegWithPayload(payload: string): Buffer {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
    Buffer.from("JFIF\0", "binary"),
    Buffer.from(payload, "utf8"),
    Buffer.from([0xff, 0xd9]),
  ]);
}

function jpeg(): Buffer {
  return jpegWithPayload("durable-outbound-image-payload");
}

function stream(bytes: Buffer): ReadableStream<Uint8Array> {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  const body = new Response(copy).body;
  if (!body) throw new Error("ReadableStream unavailable");
  return body;
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

async function queueImage(caption = "Product photo") {
  const bytes = jpeg();
  const queued = await queueWhatsAppImage(context, {
    clientMessageId: MESSAGE_ID,
    to: "0555000111",
    caption,
    fileName: "customer-product.jpg",
    declaredMime: "image/jpeg",
    declaredSize: bytes.length,
    source: stream(bytes),
  });
  return { bytes, queued };
}

beforeEach(async () => {
  await clean();
  testRoot = mkdtempSync(join(tmpdir(), "sahelflow-outbound-image-"));
  process.env.SF_DATA_DIR = testRoot;
});

afterEach(async () => {
  await removeWhatsAppMediaRoot(context).catch(() => undefined);
  rmSync(testRoot, { recursive: true, force: true });
  delete process.env.SF_DATA_DIR;
  await clean();
});

describe("durable WhatsApp outbound image send", () => {
  it("stages encrypted bytes, sends the authenticated image once, and keeps canonical local read authority", async () => {
    const { bytes, queued } = await queueImage();
    expect(queued.effectKey).toMatch(
      /^wa:[0-9a-f]{32}:[0-9a-f]{64}:image:/,
    );

    const message = await db.message.findUniqueOrThrow({
      where: { id: MESSAGE_ID },
    });
    expect(message).toMatchObject({
      direction: "outbound",
      messageType: "image",
      deliveryStatus: "sending",
      body: "Product photo",
    });
    expect(message.attachments).not.toContain("customer-product.jpg");

    const intent = await db.outboxIntent.findUniqueOrThrow({
      where: { effectKey: queued.effectKey },
    });
    expect(intent.effectType).toBe("whatsapp.image.send.v1");
    expect(intent.payloadJson).not.toContain("Product photo");
    expect(intent.payloadJson).not.toContain("customer-product.jpg");
    expect(intent.payloadJson).not.toContain(bytes.toString("base64"));

    const mediaFiles = readdirSync(whatsAppMediaRoot(context)).filter((name) =>
      name.endsWith(".sfmedia"),
    );
    expect(mediaFiles).toHaveLength(1);
    const mediaFile = mediaFiles[0];
    if (!mediaFile) throw new Error("Expected staged WhatsApp media object");
    const ciphertext = readFileSync(
      join(whatsAppMediaRoot(context), mediaFile),
    );
    expect(ciphertext.includes(bytes)).toBe(false);

    const textSender = vi.fn(async () => ({
      ok: true,
      id: "TEXT-MUST-NOT-SEND",
      status: "sent",
    }));
    const receiptLookup = vi.fn(async () => null);
    const imageSender = vi.fn(
      async (
        to: string,
        image: Buffer,
        mediaType: string,
        caption: string,
        effectKey: string,
        requestBinding: string,
      ) => {
        const inFlight = await db.outboxIntent.findUniqueOrThrow({
          where: { effectKey: queued.effectKey },
        });
        expect(inFlight.effectStartedAt).not.toBeNull();
        expect(inFlight.lockedAt).not.toBeNull();
        expect(inFlight.lockedAt?.getTime()).toBe(
          inFlight.effectStartedAt?.getTime(),
        );
        expect(to).toBe("213555000111@s.whatsapp.net");
        expect(image.equals(bytes)).toBe(true);
        expect(mediaType).toBe("image/jpeg");
        expect(caption).toBe("Product photo");
        expect(effectKey).toBe(queued.effectKey);
        expect(requestBinding).toMatch(/^[0-9a-f]{64}$/);
        return { ok: true, id: "WA-IMAGE-1", status: "sent" };
      },
    );

    await expect(
      processWhatsAppEffect(
        context,
        queued.effectKey,
        textSender,
        receiptLookup,
        imageSender,
      ),
    ).resolves.toMatchObject({
      state: "succeeded",
      providerMessageId: "WA-IMAGE-1",
      attemptCount: 1,
    });
    expect(textSender).not.toHaveBeenCalled();
    expect(receiptLookup).not.toHaveBeenCalled();
    expect(imageSender).toHaveBeenCalledTimes(1);

    const opened = await openInboxWhatsAppMedia(context, MESSAGE_ID);
    try {
      expect(opened.kind).toBe("image");
      expect(opened.mediaType).toBe("image/jpeg");
      expect(opened.fileName).toBe("customer-product.jpg");
      expect(opened.bytes.equals(bytes)).toBe(true);
    } finally {
      opened.bytes.fill(0);
    }
  });

  it("keeps one canonical staged object when same-id image contenders race", async () => {
    const firstBytes = jpegWithPayload("first-racing-image");
    const secondBytes = jpegWithPayload(
      "second-racing-image-with-a-different-byte-length",
    );
    const contenders = [
      {
        caption: "First contender",
        fileName: "first.jpg",
        bytes: firstBytes,
      },
      {
        caption: "Second contender",
        fileName: "second.jpg",
        bytes: secondBytes,
      },
    ] as const;

    const results = await Promise.allSettled(
      contenders.map((contender) =>
        queueWhatsAppImage(context, {
          clientMessageId: MESSAGE_ID,
          to: "0555000111",
          caption: contender.caption,
          fileName: contender.fileName,
          declaredMime: "image/jpeg",
          declaredSize: contender.bytes.length,
          source: stream(contender.bytes),
        }),
      ),
    );

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    if (!rejected || rejected.status !== "rejected") {
      throw new Error("Expected one conflicting same-id image contender");
    }
    expect(rejected.reason).toBeInstanceOf(Error);
    expect((rejected.reason as Error).message).toContain(
      "already bound to different image content",
    );

    const message = await db.message.findUniqueOrThrow({
      where: { id: MESSAGE_ID },
    });
    expect(["First contender", "Second contender"]).toContain(message.body);
    const winner = contenders.find((candidate) => candidate.caption === message.body);
    if (!winner) throw new Error("Expected canonical contender message");

    const mediaFiles = readdirSync(whatsAppMediaRoot(context)).filter((name) =>
      name.endsWith(".sfmedia"),
    );
    expect(mediaFiles).toHaveLength(1);
    const opened = await openInboxWhatsAppMedia(context, MESSAGE_ID);
    try {
      expect(opened.bytes.equals(winner.bytes)).toBe(true);
      expect(opened.fileName).toBe(winner.fileName);
    } finally {
      opened.bytes.fill(0);
    }
  });

  it("rejects corrupted staged ciphertext before provider effect start", async () => {
    const { queued } = await queueImage("Corruption gate");
    const mediaRoot = whatsAppMediaRoot(context);
    const mediaFile = readdirSync(mediaRoot).find((name) =>
      name.endsWith(".sfmedia"),
    );
    if (!mediaFile) throw new Error("Expected staged WhatsApp media object");
    const objectPath = join(mediaRoot, mediaFile);
    const corrupted = readFileSync(objectPath);
    const lastIndex = corrupted.length - 1;
    const lastByte = corrupted[lastIndex];
    if (lastByte === undefined) throw new Error("Expected non-empty staged media");
    corrupted[lastIndex] = lastByte ^ 0xff;
    writeFileSync(objectPath, corrupted);

    const imageSender = vi.fn(async () => ({
      ok: true,
      id: "MUST-NOT-SEND",
      status: "sent",
    }));
    const textSender = vi.fn(async () => ({
      ok: true,
      id: "TEXT-MUST-NOT-SEND",
      status: "sent",
    }));

    await expect(
      processWhatsAppEffect(
        context,
        queued.effectKey,
        textSender,
        vi.fn(async () => null),
        imageSender,
      ),
    ).resolves.toMatchObject({
      state: "dead_letter",
      errorCode: "OUTBOX_MEDIA_INVALID",
      requiresDuplicateConfirmation: false,
    });
    expect(imageSender).not.toHaveBeenCalled();
    expect(textSender).not.toHaveBeenCalled();

    await expect(
      db.outboxIntent.findUniqueOrThrow({
        where: { effectKey: queued.effectKey },
      }),
    ).resolves.toMatchObject({
      effectStartedAt: null,
      outcomeState: "none",
      status: "dead_letter",
    });
    await expect(
      db.message.findUniqueOrThrow({ where: { id: MESSAGE_ID } }),
    ).resolves.toMatchObject({ deliveryStatus: "failed" });
  });

  it("retries from encrypted local authority without requiring browser bytes again", async () => {
    const { bytes, queued } = await queueImage("Retry image");
    const unavailable = vi.fn(async () => {
      throw new SidecarRequestError(
        "not connected",
        "WHATSAPP_NOT_CONNECTED",
        true,
        false,
        503,
      );
    });
    const textSender = vi.fn(async () => ({
      ok: true,
      id: "TEXT-MUST-NOT-SEND",
      status: "sent",
    }));

    await expect(
      processWhatsAppEffect(
        context,
        queued.effectKey,
        textSender,
        vi.fn(async () => null),
        unavailable,
      ),
    ).resolves.toMatchObject({
      state: "retrying",
      errorCode: "WHATSAPP_NOT_CONNECTED",
    });

    await db.outboxIntent.update({
      where: { effectKey: queued.effectKey },
      data: { nextAttemptAt: new Date(0) },
    });
    const recovered = vi.fn(async (_to: string, image: Buffer) => {
      expect(image.equals(bytes)).toBe(true);
      return { ok: true, id: "WA-IMAGE-RETRY", status: "sent" };
    });

    await expect(
      processWhatsAppEffect(
        context,
        queued.effectKey,
        textSender,
        vi.fn(async () => null),
        recovered,
      ),
    ).resolves.toMatchObject({
      state: "succeeded",
      providerMessageId: "WA-IMAGE-RETRY",
      attemptCount: 2,
    });
    expect(unavailable).toHaveBeenCalledTimes(1);
    expect(recovered).toHaveBeenCalledTimes(1);
    expect(textSender).not.toHaveBeenCalled();
  });
});
