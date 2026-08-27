process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseWebStream } from "music-metadata";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("music-metadata", () => ({
  parseWebStream: vi.fn(async () => ({ format: { duration: 12.25 } })),
}));

import { testAuthenticatedOwnerBusinessPrincipal } from "@/lib/business-truth/principal";
import { db, shopContext } from "@/lib/db";
import {
  processWhatsAppEffect,
  queueWhatsAppVideo,
} from "../durable-send";
import {
  removeWhatsAppMediaRoot,
  whatsAppMediaRoot,
} from "../media-object-store";
import { openInboxWhatsAppMedia } from "../media-read-service";
import { openWhatsAppMessageAttachment } from "../message-attachments";

const context = {
  prisma: db,
  shop: shopContext,
  businessPrincipal: testAuthenticatedOwnerBusinessPrincipal(
    "outbound-video-test-session",
  ),
  whatsAppProviderAccountId: "213555999000:12@s.whatsapp.net",
};
const MESSAGE_ID = "77777777-7777-4777-8777-777777777777";
let testRoot = "";

function mp4(): Buffer {
  return Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x18]),
    Buffer.from("ftyp", "ascii"),
    Buffer.from("isom", "ascii"),
    Buffer.from([0x00, 0x00, 0x02, 0x00]),
    Buffer.from("isomiso2", "ascii"),
    Buffer.from("durable-outbound-video-payload", "utf8"),
  ]);
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

beforeEach(async () => {
  await clean();
  testRoot = mkdtempSync(join(tmpdir(), "sahelflow-outbound-video-"));
  process.env.SF_DATA_DIR = testRoot;
});

afterEach(async () => {
  await removeWhatsAppMediaRoot(context).catch(() => undefined);
  rmSync(testRoot, { recursive: true, force: true });
  delete process.env.SF_DATA_DIR;
  await clean();
});

describe("durable WhatsApp outbound video send", () => {
  it("rejects missing duration before creating encrypted or durable state", async () => {
    vi.mocked(parseWebStream).mockResolvedValueOnce({
      format: {},
    } as never);
    const bytes = mp4();

    await expect(
      queueWhatsAppVideo(context, {
        clientMessageId: MESSAGE_ID,
        to: "0555000111",
        caption: "Too long",
        fileName: "too-long.mp4",
        declaredMime: "video/mp4",
        declaredSize: bytes.length,
        source: stream(bytes),
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    expect(existsSync(whatsAppMediaRoot(context))).toBe(false);
    expect(await db.message.count()).toBe(0);
    expect(await db.outboxIntent.count()).toBe(0);
  });

  it("authenticates duration, stages ciphertext, sends once and keeps canonical playback authority", async () => {
    const bytes = mp4();
    const queued = await queueWhatsAppVideo(context, {
      clientMessageId: MESSAGE_ID,
      to: "0555000111",
      caption: "Product demo",
      fileName: "product-demo.mp4",
      declaredMime: "video/mp4",
      declaredSize: bytes.length,
      source: stream(bytes),
    });
    expect(queued.effectKey).toMatch(
      /^wa:[0-9a-f]{32}:[0-9a-f]{64}:video:/,
    );

    const message = await db.message.findUniqueOrThrow({
      where: { id: MESSAGE_ID },
    });
    expect(message).toMatchObject({
      direction: "outbound",
      messageType: "video",
      deliveryStatus: "sending",
      body: "Product demo",
    });
    const attachment = await openWhatsAppMessageAttachment(
      context,
      MESSAGE_ID,
      message.attachments,
    );
    expect(attachment).toMatchObject({
      kind: "video",
      mimeType: "video/mp4",
      durationSeconds: 13,
      sizeBytes: bytes.length,
    });

    const intent = await db.outboxIntent.findUniqueOrThrow({
      where: { effectKey: queued.effectKey },
    });
    expect(intent.effectType).toBe("whatsapp.video.send.v1");
    expect(intent.payloadJson).not.toContain("Product demo");
    expect(intent.payloadJson).not.toContain("product-demo.mp4");
    expect(intent.payloadJson).not.toContain(bytes.toString("base64"));

    const mediaFiles = readdirSync(whatsAppMediaRoot(context)).filter((name) =>
      name.endsWith(".sfmedia"),
    );
    expect(mediaFiles).toHaveLength(1);
    const mediaFile = mediaFiles[0];
    if (!mediaFile) throw new Error("Expected staged WhatsApp video object");
    expect(
      readFileSync(join(whatsAppMediaRoot(context), mediaFile)).includes(bytes),
    ).toBe(false);

    const textSender = vi.fn(async () => ({
      ok: true,
      id: "TEXT-MUST-NOT-SEND",
      status: "sent",
    }));
    const receiptLookup = vi.fn(async () => null);
    const imageSender = vi.fn(async () => ({
      ok: true,
      id: "IMAGE-MUST-NOT-SEND",
      status: "sent",
    }));
    const videoSender = vi.fn(
      async (
        to: string,
        video: Buffer,
        mediaType: string,
        caption: string,
        effectKey: string,
        requestBinding: string,
      ) => {
        expect(to).toBe("213555000111@s.whatsapp.net");
        expect(video.equals(bytes)).toBe(true);
        expect(mediaType).toBe("video/mp4");
        expect(caption).toBe("Product demo");
        expect(effectKey).toBe(queued.effectKey);
        expect(requestBinding).toMatch(/^[0-9a-f]{64}$/);
        return { ok: true, id: "WA-VIDEO-1", status: "sent" };
      },
    );

    await expect(
      processWhatsAppEffect(
        context,
        queued.effectKey,
        textSender,
        receiptLookup,
        imageSender,
        videoSender,
      ),
    ).resolves.toMatchObject({
      state: "succeeded",
      providerMessageId: "WA-VIDEO-1",
      attemptCount: 1,
    });
    expect(textSender).not.toHaveBeenCalled();
    expect(imageSender).not.toHaveBeenCalled();
    expect(videoSender).toHaveBeenCalledTimes(1);

    const opened = await openInboxWhatsAppMedia(context, MESSAGE_ID);
    try {
      expect(opened.kind).toBe("video");
      expect(opened.mediaType).toBe("video/mp4");
      expect(opened.fileName).toBe("product-demo.mp4");
      expect(opened.bytes.equals(bytes)).toBe(true);
    } finally {
      opened.bytes.fill(0);
    }
  });
});
