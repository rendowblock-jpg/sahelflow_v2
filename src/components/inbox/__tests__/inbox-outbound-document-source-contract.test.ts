import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("WhatsApp outbound document source boundary", () => {
  it("exposes one bounded document picker and the durable send monitor", () => {
    const thread = source("src/components/inbox/inbox-v3-thread.tsx");
    const workspace = source("src/hooks/use-inbox-workspace.ts");

    expect(thread).toContain('accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,');
    expect(thread).toContain('data-inbox-document-picker="true"');
    expect(thread).toContain('data-inbox-document-input="true"');
    expect(thread).toContain('aria-label={copy("mediaDocument")}');
    expect(thread).toContain("void sendDocument(file, quotedId)");
    expect(workspace).toContain(
      "MAX_OUTBOUND_DOCUMENT_BYTES = 64 * 1024 * 1024",
    );
    expect(workspace).toContain('"/api/whatsapp/send-document"');
    expect(workspace).toContain('form.set("document", file');
    expect(workspace).toContain("void monitorWhatsAppEffect(");
  });

  it("allows only the bounded business document declaration set", () => {
    const route = source("src/app/api/whatsapp/send-document/route.ts");
    const workspace = source("src/hooks/use-inbox-workspace.ts");

    expect(route).toContain('"application/pdf"');
    expect(route).toContain(
      '"application/vnd.openxmlformats-officedocument.wordprocessingml.document"',
    );
    expect(route).toContain('"text/csv"');
    expect(route).toContain("!SAFE_DOCUMENT_TYPES.has(mediaType)");
    expect(workspace).toContain(
      "!SAFE_OUTBOUND_DOCUMENT_TYPES.has(mediaType)",
    );
  });

  it("authenticates classified bytes before staging and derives a truthful document title", () => {
    const durable = source("src/lib/whatsapp/durable-send.ts");
    const queueStart = durable.indexOf(
      "export async function queueWhatsAppDocument",
    );
    const queueEnd = durable.indexOf(
      "async function recoverPreEffectLease",
      queueStart,
    );
    const queue = durable.slice(queueStart, queueEnd);

    expect(queue).toContain('kind: "document"');
    expect(queue).toContain("await writeWhatsAppMediaObject(context");
    expect(queue).toContain("createWhatsAppEffectAuthority");
    expect(queue.indexOf("await writeWhatsAppMediaObject(context")).toBeLessThan(
      queue.indexOf("createWhatsAppEffectAuthority"),
    );
    expect(queue).toContain("documentFallbackName(attachmentMimeType)");
    expect(queue).toContain("outboundAttachmentMimeType(");
    expect(queue).toContain("mimeType: attachmentMimeType");
    expect(queue).toContain("await discardStagedMediaIfUnreferenced(context, clientMessageId)");
    expect(queue).toContain("attachmentKey.fill(0)");
    expect(durable).toContain('messageType: "document"');
    expect(durable).toContain("effectType: WHATSAPP_DOCUMENT_EFFECT_TYPE");
    expect(durable).toContain('"whatsapp.document.send.v1"');
    expect(durable).toContain(
      "documentPayload.attachmentMimeType ?? documentPayload.media.mediaType",
    );
  });

  it("dispatches OOXML documents under their declared Office mimetype, never the zip container", () => {
    const durable = source("src/lib/whatsapp/durable-send.ts");
    const sidecar = source("sidecars/whatsapp/index.ts");
    const wa = source("sidecars/whatsapp/whatsapp.ts");

    // The encrypted store classifies OOXML truthfully as a ZIP container; the
    // recipient-facing attachment must resolve to the declared Office type.
    expect(durable).toContain("OOXML_DOCUMENT_MIMES");
    expect(durable).toContain(
      '"application/vnd.openxmlformats-officedocument.wordprocessingml.document"',
    );
    expect(durable).toContain(
      '"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"',
    );
    expect(sidecar).toContain(
      '"application/vnd.openxmlformats-officedocument.wordprocessingml.document"',
    );
    expect(sidecar).toContain(
      '"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"',
    );
    expect(wa).toContain(
      "vnd\\.openxmlformats-officedocument\\.wordprocessingml\\.document",
    );
    expect(wa).toContain("text\\/(?:plain|csv)");
  });

  it("bounds both multipart hops before form-data materialization", () => {
    const route = source("src/app/api/whatsapp/send-document/route.ts");
    const sidecar = source("sidecars/whatsapp/index.ts");
    const sidecarClient = source("src/lib/whatsapp/sidecar-client.ts");

    expect(route).toContain("MAX_DOCUMENT_FORM_BYTES");
    expect(route).toContain("req.body.getReader()");
    expect(route).not.toContain("await req.formData()");
    expect(sidecar).toContain("MAX_OUTBOUND_DOCUMENT_FORM_BYTES");
    expect(sidecar).toContain("readBoundedDocumentForm(context.req.raw)");
    expect(sidecar).not.toContain("context.req.raw.formData()");
    expect(sidecarClient).toContain('"/send-document"');
    expect(sidecarClient).not.toContain('.toString("base64")');
  });

  it("keeps staged document bytes canonical, account-bound and dispatchable", () => {
    const durable = source("src/lib/whatsapp/durable-send.ts");
    const sidecar = source("sidecars/whatsapp/index.ts");
    const wa = source("sidecars/whatsapp/whatsapp.ts");
    const mediaRead = source("src/lib/whatsapp/media-read-service.ts");
    const queue = source("src/lib/whatsapp/outbound-document-queue.ts");
    const authority = source("src/lib/whatsapp/effect-authority.ts");

    expect(sidecar).toContain('app.post("/send-document"');
    expect(sidecar).toContain("documentEffectKey(effectKey)");
    expect(sidecar).toContain("deterministicWhatsAppMessageId(effectKey)");
    expect(sidecar).toContain("bytes.fill(0)");
    expect(wa).toContain("async sendDocument(");
    expect(wa).toContain("fileName,");
    expect(mediaRead).toContain("openQueuedWhatsAppDocumentReceipt");
    expect(queue).toContain("withWhatsAppMediaLifecycleLease(");
    expect(queue).toContain("whatsAppMediaRoot(context)");
    expect(authority).toContain('"document"');
    expect(durable).toContain('"whatsapp_document.queue.v1"');
  });

  it("preserves safe document file-name extensions on authenticated reads", () => {
    const mediaRead = source("src/lib/whatsapp/media-read-service.ts");

    expect(mediaRead).toContain("DOCUMENT_NAME_EXTENSIONS");
    expect(mediaRead).toContain('attachment.kind === "document"');
    expect(mediaRead).toContain('kind !== "document" &&\n      kind !== "audio"');
  });
});
