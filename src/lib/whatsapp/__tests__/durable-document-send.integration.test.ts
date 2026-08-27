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
  queueWhatsAppDocument,
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
    "outbound-document-test-session",
  ),
  whatsAppProviderAccountId: "213555999000:12@s.whatsapp.net",
};
const MESSAGE_ID = "88888888-8888-4888-8888-888888888888";
let testRoot = "";

function pdfDocument(): Buffer {
  return Buffer.concat([
    Buffer.from("%PDF-1.4\n", "ascii"),
    Buffer.from("durable-outbound-document-payload\n", "utf8"),
    Buffer.from("%%EOF", "ascii"),
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
  testRoot = mkdtempSync(join(tmpdir(), "sahelflow-outbound-document-"));
  process.env.SF_DATA_DIR = testRoot;
});

afterEach(async () => {
  await removeWhatsAppMediaRoot(context).catch(() => undefined);
  rmSync(testRoot, { recursive: true, force: true });
  delete process.env.SF_DATA_DIR;
  await clean();
});

describe("durable WhatsApp outbound document send", () => {
  it("rejects a declaration outside the business document set before staging", async () => {
    const bytes = pdfDocument();

    await expect(
      queueWhatsAppDocument(context, {
        clientMessageId: MESSAGE_ID,
        to: "0555000111",
        caption: "Archive",
        fileName: "bundle.zip",
        declaredMime: "application/zip",
        declaredSize: bytes.length,
        source: stream(bytes),
      }),
    ).rejects.toBeInstanceOf(ZodError);

    expect(existsSync(whatsAppMediaRoot(context))).toBe(false);
    expect(await db.message.count()).toBe(0);
    expect(await db.outboxIntent.count()).toBe(0);
  });

  it("rejects content that disagrees with its declared document type", async () => {
    const bytes = Buffer.from("plain text pretending to be a pdf", "utf8");

    await expect(
      queueWhatsAppDocument(context, {
        clientMessageId: MESSAGE_ID,
        to: "0555000111",
        caption: "Mismatch",
        fileName: "fake.pdf",
        declaredMime: "application/pdf",
        declaredSize: bytes.length,
        source: stream(bytes),
      }),
    ).rejects.toMatchObject({ code: "MEDIA_CONTENT_TYPE_MISMATCH" });

    expect(await db.message.count()).toBe(0);
    expect(await db.outboxIntent.count()).toBe(0);
  });

  it("bounds the declared size before any encrypted staging", async () => {
    const bytes = pdfDocument();

    await expect(
      queueWhatsAppDocument(context, {
        clientMessageId: MESSAGE_ID,
        to: "0555000111",
        caption: "Too large",
        fileName: "large.pdf",
        declaredMime: "application/pdf",
        declaredSize: 64 * 1024 * 1024 + 1,
        source: stream(bytes),
      }),
    ).rejects.toBeInstanceOf(ZodError);

    expect(existsSync(whatsAppMediaRoot(context))).toBe(false);
    expect(await db.message.count()).toBe(0);
  });

  it("authenticates, stages ciphertext, dispatches once with the document title and keeps read authority", async () => {
    const bytes = pdfDocument();
    const queued = await queueWhatsAppDocument(context, {
      clientMessageId: MESSAGE_ID,
      to: "0555000111",
      caption: "Invoice February",
      fileName: "../escaped/invoice-2026-02.pdf",
      declaredMime: "application/pdf",
      declaredSize: bytes.length,
      source: stream(bytes),
    });
    expect(queued.effectKey).toMatch(
      /^wa:[0-9a-f]{32}:[0-9a-f]{64}:document:/,
    );

    const message = await db.message.findUniqueOrThrow({
      where: { id: MESSAGE_ID },
    });
    expect(message).toMatchObject({
      direction: "outbound",
      messageType: "document",
      deliveryStatus: "sending",
      body: "Invoice February",
    });
    const attachment = await openWhatsAppMessageAttachment(
      context,
      MESSAGE_ID,
      message.attachments,
    );
    expect(attachment).toMatchObject({
      kind: "document",
      state: "ready",
      mimeType: "application/pdf",
      fileName: "invoice-2026-02.pdf",
      sizeBytes: bytes.length,
      durationSeconds: null,
    });

    const intent = await db.outboxIntent.findUniqueOrThrow({
      where: { effectKey: queued.effectKey },
    });
    expect(intent.effectType).toBe("whatsapp.document.send.v1");
    expect(intent.payloadJson).not.toContain("Invoice February");
    expect(intent.payloadJson).not.toContain("invoice-2026-02.pdf");
    expect(intent.payloadJson).not.toContain(bytes.toString("base64"));

    const mediaFiles = readdirSync(whatsAppMediaRoot(context)).filter((name) =>
      name.endsWith(".sfmedia"),
    );
    expect(mediaFiles).toHaveLength(1);
    const mediaFile = mediaFiles[0];
    if (!mediaFile) throw new Error("Expected staged WhatsApp document object");
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
    const documentSender = vi.fn(
      async (
        to: string,
        document: Buffer,
        mediaType: string,
        fileName: string,
        caption: string,
        effectKey: string,
        requestBinding: string,
      ) => {
        expect(to).toBe("213555000111@s.whatsapp.net");
        expect(document.equals(bytes)).toBe(true);
        expect(mediaType).toBe("application/pdf");
        expect(fileName).toBe("invoice-2026-02.pdf");
        expect(caption).toBe("Invoice February");
        expect(effectKey).toBe(queued.effectKey);
        expect(requestBinding).toMatch(/^[0-9a-f]{64}$/);
        return { ok: true, id: "WA-DOCUMENT-1", status: "sent" };
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
      ),
    ).resolves.toMatchObject({
      state: "succeeded",
      providerMessageId: "WA-DOCUMENT-1",
      attemptCount: 1,
    });
    expect(textSender).not.toHaveBeenCalled();
    expect(imageSender).not.toHaveBeenCalled();
    expect(videoSender).not.toHaveBeenCalled();
    expect(documentSender).toHaveBeenCalledTimes(1);

    const opened = await openInboxWhatsAppMedia(context, MESSAGE_ID);
    try {
      expect(opened.kind).toBe("document");
      expect(opened.mediaType).toBe("application/pdf");
      expect(opened.fileName).toBe("invoice-2026-02.pdf");
      expect(opened.bytes.equals(bytes)).toBe(true);
    } finally {
      opened.bytes.fill(0);
    }
  });

  it("replays the same client message identity without a second dispatch", async () => {
    const bytes = pdfDocument();
    const input = {
      clientMessageId: MESSAGE_ID,
      to: "0555000111",
      caption: "Catalog",
      fileName: "catalog.pdf",
      declaredMime: "application/pdf",
      declaredSize: bytes.length,
    } as const;
    const first = await queueWhatsAppDocument(context, {
      ...input,
      source: stream(bytes),
    });
    const second = await queueWhatsAppDocument(context, {
      ...input,
      source: stream(bytes),
    });

    expect(second.effectKey).toBe(first.effectKey);
    expect(second.replayed).toBe(true);
    expect(await db.message.count()).toBe(1);
    expect(await db.outboxIntent.count()).toBe(1);

    const documentSender = vi.fn(async () => ({
      ok: true,
      id: "WA-DOCUMENT-REPLAY",
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
        documentSender,
      ),
    ).resolves.toMatchObject({ state: "succeeded" });
    expect(documentSender).toHaveBeenCalledTimes(1);
  });

  it("removes the staged object when the durable commit rejects and no message references it", async () => {
    const bytes = pdfDocument();

    // An individual @lid recipient without persisted inbound provenance is
    // rejected inside the canonical command transaction, after staging.
    await expect(
      queueWhatsAppDocument(context, {
        clientMessageId: MESSAGE_ID,
        to: "213555000111@lid",
        caption: "Unbound lid",
        fileName: "unbound-lid.pdf",
        declaredMime: "application/pdf",
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

  it("derives a truthful fallback title when the browser provides none", async () => {
    const bytes = pdfDocument();
    await queueWhatsAppDocument(context, {
      clientMessageId: MESSAGE_ID,
      to: "0555000111",
      caption: "",
      fileName: null,
      declaredMime: "application/pdf",
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
      kind: "document",
      fileName: "document.pdf",
    });
  });
});
