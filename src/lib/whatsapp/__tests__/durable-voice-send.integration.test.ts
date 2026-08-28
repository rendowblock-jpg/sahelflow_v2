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
import { ZodError } from "zod";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { testAuthenticatedOwnerBusinessPrincipal } from "@/lib/business-truth/principal";
import { db, shopContext } from "@/lib/db";
import {
  processWhatsAppEffect,
  queueWhatsAppVoice,
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
    "outbound-voice-test-session",
  ),
  whatsAppProviderAccountId: "213555999000:12@s.whatsapp.net",
};
const MESSAGE_ID = "77777777-7777-4777-8777-777777777777";
let testRoot = "";

// --- OGG page construction (MSB-first CRC-32, poly 0x04c11db7, init 0) ---

const OGG_CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i << 24;
    for (let bit = 0; bit < 8; bit += 1) {
      value =
        (value & 0x80000000) !== 0
          ? ((value << 1) ^ 0x04c11db7) >>> 0
          : (value << 1) >>> 0;
    }
    table[i] = value >>> 0;
  }
  return table;
})();

function oggCrc(page: Uint8Array): number {
  let crc = 0;
  for (let index = 0; index < page.length; index += 1) {
    const byte = page[index] ?? 0;
    crc = (((crc << 8) >>> 0) ^ (OGG_CRC_TABLE[(((crc >>> 24) ^ byte) & 0xff)] ?? 0)) >>> 0;
  }
  return crc >>> 0;
}

function oggPage(options: {
  headerType: number;
  granule: bigint;
  serial: number;
  sequence: number;
  payload: Uint8Array;
}): Buffer {
  const segments: number[] = [];
  let remaining = options.payload.length;
  while (remaining >= 255) {
    segments.push(255);
    remaining -= 255;
  }
  segments.push(remaining);
  const headerSize = 27 + segments.length;
  const page = Buffer.alloc(headerSize + options.payload.length);
  page.write("OggS", 0, "ascii");
  page.writeUInt8(0, 4);
  page.writeUInt8(options.headerType, 5);
  page.writeBigUInt64LE(options.granule, 6);
  page.writeUInt32LE(options.serial, 14);
  page.writeUInt32LE(options.sequence, 18);
  page.writeUInt32LE(0, 22);
  page.writeUInt8(segments.length, 26);
  segments.forEach((value, index) => page.writeUInt8(value, 27 + index));
  Buffer.from(options.payload).copy(page, headerSize);
  page.writeUInt32LE(oggCrc(page), 22);
  return page;
}

function opusHead(): Buffer {
  const head = Buffer.alloc(19);
  head.write("OpusHead", 0, "ascii");
  head.writeUInt8(1, 8);
  head.writeUInt8(1, 9);
  head.writeUInt16LE(312, 10);
  head.writeUInt32LE(48000, 12);
  head.writeUInt16LE(0, 16);
  head.writeUInt8(0, 18);
  return head;
}

function opusTags(): Buffer {
  const vendor = Buffer.from("sahelflow-test", "utf8");
  const tags = Buffer.alloc(12 + vendor.length);
  tags.write("OpusTags", 0, "ascii");
  tags.writeUInt32LE(vendor.length, 8);
  vendor.copy(tags, 12);
  return tags;
}

function opusVoiceNote(): Buffer {
  const serial = 0x5a5a5a5a;
  // Page 0 carries the BOS identification header; the final EOS page carries
  // the comment header plus one minimal audio packet. This two-page layout is
  // what the metadata reader walks deterministically.
  return Buffer.concat([
    oggPage({
      headerType: 0x02,
      granule: 0n,
      serial,
      sequence: 0,
      payload: opusHead(),
    }),
    oggPage({
      headerType: 0x04,
      granule: 5112n,
      serial,
      sequence: 1,
      payload: Buffer.concat([opusTags(), Buffer.from([0xf8, 0x00, 0x00])]),
    }),
  ]);
}

function vorbisOgg(): Buffer {
  const id = Buffer.alloc(30);
  id.writeUInt8(1, 0);
  id.write("vorbis", 1, "ascii");
  id.writeUInt32LE(0, 7);
  id.writeUInt8(1, 11);
  id.writeUInt32LE(44100, 12);
  id.writeInt32LE(-1, 16);
  id.writeInt32LE(-1, 20);
  id.writeInt32LE(-1, 24);
  id.writeUInt8(0x01, 28);
  id.writeUInt8(0x00, 29);
  const vendor = Buffer.from("sahelflow-test", "utf8");
  const comment = Buffer.alloc(7 + 4 + vendor.length + 4);
  comment.writeUInt8(3, 0);
  comment.write("vorbis", 1, "ascii");
  comment.writeUInt32LE(vendor.length, 7);
  vendor.copy(comment, 11);
  comment.writeUInt32LE(0, 11 + vendor.length);
  return Buffer.concat([
    oggPage({
      headerType: 0x02,
      granule: 0n,
      serial: 0x11223344,
      sequence: 0,
      payload: id,
    }),
    oggPage({
      headerType: 0x04,
      granule: 0n,
      serial: 0x11223344,
      sequence: 1,
      payload: comment,
    }),
  ]);
}

function wavBytes(): Buffer {
  const sampleRate = 8000;
  const dataSize = 400;
  const wav = Buffer.alloc(44 + dataSize);
  wav.write("RIFF", 0, "ascii");
  wav.writeUInt32LE(36 + dataSize, 4);
  wav.write("WAVE", 8, "ascii");
  wav.write("fmt ", 12, "ascii");
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate, 28);
  wav.writeUInt16LE(1, 32);
  wav.writeUInt16LE(8, 34);
  wav.write("data", 36, "ascii");
  wav.writeUInt32LE(dataSize, 40);
  for (let index = 0; index < dataSize; index += 1) {
    wav.writeUInt8(index % 251, 44 + index);
  }
  return wav;
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
  testRoot = mkdtempSync(join(tmpdir(), "sahelflow-outbound-voice-"));
  process.env.SF_DATA_DIR = testRoot;
});

afterEach(async () => {
  await removeWhatsAppMediaRoot(context).catch(() => undefined);
  rmSync(testRoot, { recursive: true, force: true });
  delete process.env.SF_DATA_DIR;
  await clean();
});

describe("durable WhatsApp outbound voice send", () => {
  it("rejects a declaration outside the bounded audio set before staging", async () => {
    const bytes = opusVoiceNote();

    await expect(
      queueWhatsAppVoice(context, {
        clientMessageId: MESSAGE_ID,
        to: "0555000111",
        declaredMime: "application/zip",
        declaredSize: bytes.length,
        source: stream(bytes),
      }),
    ).rejects.toBeInstanceOf(ZodError);

    expect(existsSync(whatsAppMediaRoot(context))).toBe(false);
    expect(await db.message.count()).toBe(0);
    expect(await db.outboxIntent.count()).toBe(0);
  });

  it("refuses unauthenticated audio before any staged object exists", async () => {
    const bytes = Buffer.from("plain text pretending to be audio", "utf8");

    await expect(
      queueWhatsAppVoice(context, {
        clientMessageId: MESSAGE_ID,
        to: "0555000111",
        declaredMime: "audio/mpeg",
        declaredSize: bytes.length,
        source: stream(bytes),
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    expect(existsSync(whatsAppMediaRoot(context))).toBe(false);
    expect(await db.message.count()).toBe(0);
    expect(await db.outboxIntent.count()).toBe(0);
  });

  it("rejects OGG content whose codec is not Opus", async () => {
    const bytes = vorbisOgg();

    await expect(
      queueWhatsAppVoice(context, {
        clientMessageId: MESSAGE_ID,
        to: "0555000111",
        declaredMime: "audio/ogg",
        declaredSize: bytes.length,
        source: stream(bytes),
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    expect(existsSync(whatsAppMediaRoot(context))).toBe(false);
    expect(await db.message.count()).toBe(0);
  });

  it("queues authenticated OGG/Opus as a voice note, stages ciphertext and dispatches once", async () => {
    const bytes = opusVoiceNote();
    const queued = await queueWhatsAppVoice(context, {
      clientMessageId: MESSAGE_ID,
      to: "0555000111",
      declaredMime: "audio/ogg",
      declaredSize: bytes.length,
      source: stream(bytes),
    });
    expect(queued.effectKey).toMatch(/^wa:[0-9a-f]{32}:[0-9a-f]{64}:voice:/);

    const message = await db.message.findUniqueOrThrow({
      where: { id: MESSAGE_ID },
    });
    expect(message).toMatchObject({
      direction: "outbound",
      messageType: "audio",
      deliveryStatus: "sending",
      body: "",
    });
    const attachment = await openWhatsAppMessageAttachment(
      context,
      MESSAGE_ID,
      message.attachments,
    );
    expect(attachment).toMatchObject({
      kind: "audio",
      state: "ready",
      mimeType: "audio/ogg",
      fileName: null,
      sizeBytes: bytes.length,
      voiceMessage: true,
    });
    // The fixture granule (5112 minus 312 pre-skip at 48 kHz) is exactly
    // 0.1 seconds; the authenticated duration rounds up to 1.
    expect(attachment?.durationSeconds).toBe(1);

    const intent = await db.outboxIntent.findUniqueOrThrow({
      where: { effectKey: queued.effectKey },
    });
    expect(intent.effectType).toBe("whatsapp.voice.send.v1");
    expect(intent.payloadJson).not.toContain(bytes.toString("base64"));

    const mediaFiles = readdirSync(whatsAppMediaRoot(context)).filter((name) =>
      name.endsWith(".sfmedia"),
    );
    expect(mediaFiles).toHaveLength(1);
    const mediaFile = mediaFiles[0];
    if (!mediaFile) throw new Error("Expected staged WhatsApp voice object");
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
    const videoSender = vi.fn(async () => ({
      ok: true,
      id: "VIDEO-MUST-NOT-SEND",
      status: "sent",
    }));
    const documentSender = vi.fn(async () => ({
      ok: true,
      id: "DOCUMENT-MUST-NOT-SEND",
      status: "sent",
    }));
    const voiceSender = vi.fn(
      async (
        to: string,
        audio: Buffer,
        mediaType: string,
        voiceMessage: boolean,
        durationSeconds: number | null,
        effectKey: string,
        requestBinding: string,
      ) => {
        expect(to).toBe("213555000111@s.whatsapp.net");
        expect(audio.equals(bytes)).toBe(true);
        expect(mediaType).toBe("audio/ogg");
        expect(voiceMessage).toBe(true);
        expect(durationSeconds).toBe(1);
        expect(effectKey).toBe(queued.effectKey);
        expect(requestBinding).toMatch(/^[0-9a-f]{64}$/);
        return { ok: true, id: "WA-VOICE-1", status: "sent" };
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
        documentSender,
        voiceSender,
      ),
    ).resolves.toMatchObject({
      state: "succeeded",
      providerMessageId: "WA-VOICE-1",
      attemptCount: 1,
    });
    expect(textSender).not.toHaveBeenCalled();
    expect(imageSender).not.toHaveBeenCalled();
    expect(videoSender).not.toHaveBeenCalled();
    expect(documentSender).not.toHaveBeenCalled();
    expect(voiceSender).toHaveBeenCalledTimes(1);

    const opened = await openInboxWhatsAppMedia(context, MESSAGE_ID);
    try {
      expect(opened.kind).toBe("audio");
      expect(opened.mediaType).toBe("audio/ogg");
      expect(opened.bytes.equals(bytes)).toBe(true);
    } finally {
      opened.bytes.fill(0);
    }
  });

  it("queues authenticated non-Opus audio as a plain audio attachment", async () => {
    const bytes = wavBytes();
    const queued = await queueWhatsAppVoice(context, {
      clientMessageId: MESSAGE_ID,
      to: "0555000111",
      declaredMime: "audio/x-wav",
      declaredSize: bytes.length,
      source: stream(bytes),
    });

    const message = await db.message.findUniqueOrThrow({
      where: { id: MESSAGE_ID },
    });
    const attachment = await openWhatsAppMessageAttachment(
      context,
      MESSAGE_ID,
      message.attachments,
    );
    expect(attachment).toMatchObject({
      kind: "audio",
      mimeType: "audio/wav",
      voiceMessage: false,
      sizeBytes: bytes.length,
    });

    const intent = await db.outboxIntent.findUniqueOrThrow({
      where: { effectKey: queued.effectKey },
    });
    expect(intent.effectType).toBe("whatsapp.voice.send.v1");
  });

  it("replays the same client message identity without a second dispatch", async () => {
    const bytes = opusVoiceNote();
    const input = {
      clientMessageId: MESSAGE_ID,
      to: "0555000111",
      declaredMime: "audio/ogg",
      declaredSize: bytes.length,
    } as const;
    const first = await queueWhatsAppVoice(context, {
      ...input,
      source: stream(bytes),
    });
    const second = await queueWhatsAppVoice(context, {
      ...input,
      source: stream(bytes),
    });

    expect(second.effectKey).toBe(first.effectKey);
    expect(second.replayed).toBe(true);
    expect(await db.message.count()).toBe(1);
    expect(await db.outboxIntent.count()).toBe(1);

    const voiceSender = vi.fn(async () => ({
      ok: true,
      id: "WA-VOICE-REPLAY",
      status: "sent",
    }));
    await expect(
      processWhatsAppEffect(
        context,
        first.effectKey,
        vi.fn(async () => ({ ok: true, id: "X", status: "sent" })),
        vi.fn(async () => null),
        vi.fn(async () => ({ ok: true, id: "X", status: "sent" })),
        vi.fn(async () => ({ ok: true, id: "X", status: "sent" })),
        vi.fn(async () => ({ ok: true, id: "X", status: "sent" })),
        voiceSender,
      ),
    ).resolves.toMatchObject({ state: "succeeded" });
    expect(voiceSender).toHaveBeenCalledTimes(1);
  });

  it("removes the staged object when the durable commit rejects and no message references it", async () => {
    const bytes = opusVoiceNote();

    // An individual @lid recipient without persisted inbound provenance is
    // rejected inside the canonical command transaction, after staging.
    await expect(
      queueWhatsAppVoice(context, {
        clientMessageId: MESSAGE_ID,
        to: "213555000111@lid",
        declaredMime: "audio/ogg",
        declaredSize: bytes.length,
        source: stream(bytes),
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const mediaFiles = existsSync(whatsAppMediaRoot(context))
      ? readdirSync(whatsAppMediaRoot(context)).filter((name) =>
          name.endsWith(".sfmedia"),
        )
      : [];
    expect(mediaFiles).toHaveLength(0);
    expect(await db.message.count()).toBe(0);
    expect(await db.outboxIntent.count()).toBe(0);
  });
});
