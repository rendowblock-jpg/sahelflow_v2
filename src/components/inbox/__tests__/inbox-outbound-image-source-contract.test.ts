import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("WhatsApp outbound image source boundary", () => {
  it("exposes only the bounded image picker and reuses the durable send monitor", () => {
    const thread = source("src/components/inbox/inbox-v3-thread.tsx");
    const workspace = source("src/hooks/use-inbox-workspace.ts");

    expect(thread).toContain('accept="image/jpeg,image/png,image/webp"');
    expect(thread).toContain('data-inbox-image-picker="true"');
    expect(thread).toContain('aria-label={copy("mediaImage")}');
    expect(thread).toContain("void sendImage(file, quotedId)");
    expect(thread).toContain("disabled={sending || !canSend}");
    expect(workspace).toContain("MAX_OUTBOUND_IMAGE_BYTES = 20 * 1024 * 1024");
    expect(workspace).toContain('"/api/whatsapp/send-image"');
        // Ledger INB-28 disposition: the four duplicated send bodies collapsed
    // into one factory; the per-media form field lives in the spec table
    // (fieldName) and the shared call site is form.set(spec.fieldName, file…).
    expect(workspace).toContain("form.set(spec.fieldName, file");
    expect(workspace).toContain('fieldName: "image"');
    expect(workspace).toContain("void monitorWhatsAppEffect(");
    expect(workspace).toContain("await loadMessages(chat, { background: true })");
  });

  it("treats missing or generic browser MIME as a hint while keeping byte authority", () => {
    const thread = source("src/components/inbox/inbox-v3-thread.tsx");
    const workspace = source("src/hooks/use-inbox-workspace.ts");
    const mediaStore = source("src/lib/whatsapp/media-object-store.ts");

    expect(thread).toContain('declaredType !== "application/octet-stream"');
    expect(thread).toContain(".slice(0, 12)");
    expect(thread).toContain('sniffedType = "image/jpeg"');
    expect(thread).toContain('sniffedType = "image/png"');
    expect(thread).toContain('sniffedType = "image/webp"');
    expect(thread).toContain("new File([file], file.name");
    expect(workspace).toContain("!SAFE_OUTBOUND_IMAGE_TYPES.has(mediaType)");
    expect(mediaStore).toContain("sniffMediaType(kind");
    expect(mediaStore).toContain("MEDIA_CONTENT_TYPE_MISMATCH");
  });

  it("removes only unqueued optimistic images and reloads canonical messages", () => {
    const workspace = source("src/hooks/use-inbox-workspace.ts");
    const sendImageStart = workspace.indexOf("const createMediaSender = useCallback");
    const sendImageEnd = workspace.indexOf("const connectWhatsApp", sendImageStart);
    const sendImage = workspace.slice(sendImageStart, sendImageEnd);

    expect(sendImage).toContain("let knownEffectKey: string | null = null");
    expect(sendImage).toContain("knownEffectKey = data.effectKey ?? null");
    expect(sendImage).toContain("if (knownEffectKey)");
    expect(sendImage).toContain(
      "current.filter((message) => message.id !== tempId)",
    );
    expect(sendImage).toContain("await loadMessages(chat, { background: true })");
    // Pre-effect cancellation removes the optimistic image before the known
    // effect reconciliation; the generic fallback filter stays last.
    expect(sendImage.indexOf('"AbortError"')).toBeLessThan(
      sendImage.indexOf("if (knownEffectKey)"),
    );
    expect(sendImage.indexOf("if (knownEffectKey)")).toBeLessThan(
      sendImage.lastIndexOf("current.filter((message) => message.id !== tempId)"),
    );
  });

  it("rejects unavailable account and invalid LID provenance before staging", () => {
    const route = source("src/app/api/whatsapp/send-image/route.ts");
    const providerPreflight = route.indexOf("providerStatus = await sidecar.status()");
    const lidPreflight = route.indexOf('if (jid.endsWith("@lid"))');
    const stageCall = route.indexOf("const queued = await queueWhatsAppImage");

    expect(providerPreflight).toBeGreaterThanOrEqual(0);
    expect(lidPreflight).toBeGreaterThan(providerPreflight);
    expect(stageCall).toBeGreaterThan(lidPreflight);
    expect(route).toContain("conversation.messages.length === 0");
    expect(route).toContain(
      "WhatsApp LID replies require persisted inbound message provenance",
    );
  });

  it("bounds multipart bytes before form-data materialization", () => {
    const route = source("src/app/api/whatsapp/send-image/route.ts");

    expect(route).toContain("MAX_IMAGE_FORM_BYTES");
    expect(route).toContain("req.body.getReader()");
    expect(route).toContain(
      "offset + next.value.byteLength > MAX_IMAGE_FORM_BYTES",
    );
    expect(route).toContain("await reader.cancel().catch(() => undefined)");
    expect(route).toContain("bounded.subarray(0, offset)");
    expect(route).not.toContain("await req.formData()");
  });

  it("bounds sidecar multipart bytes before parsing even without Content-Length", () => {
    const sidecar = source("sidecars/whatsapp/index.ts");

    expect(sidecar).toContain("MAX_OUTBOUND_IMAGE_FORM_BYTES");
    expect(sidecar).toContain("request.body.getReader()");
    expect(sidecar).toContain(
      "offset + next.value.byteLength >\n        MAX_OUTBOUND_IMAGE_FORM_BYTES",
    );
    expect(sidecar).toContain("await reader.cancel().catch(() => undefined)");
    expect(sidecar).toContain("bounded.subarray(0, offset)");
    expect(sidecar).toContain("readBoundedImageForm(context.req.raw)");
    expect(sidecar).not.toContain("context.req.raw.formData()");
  });

  it("stages encrypted bytes before the provider-effect boundary", () => {
    const route = source("src/app/api/whatsapp/send-image/route.ts");
    const durable = source("src/lib/whatsapp/durable-send.ts");
    const mediaStore = source("src/lib/whatsapp/media-object-store.ts");

    expect(route).toContain('requireTrustedAction("conversations.reply")');
    expect(route).toContain('"customers.contact.read"');
    expect(route).toContain("source: new Blob([imageBytes]).stream()");
    expect(route).toContain("queueWhatsAppImage(context");
    expect(route).toContain("processWhatsAppEffect(context, queued.effectKey)");
    // Derived bounded thumbnail staging is best-effort and never blocks the
    // durable send (#317).
    expect(route).toContain("deriveWhatsAppThumbnail(imageBytes)");
    expect(route).toContain("writeWhatsAppMediaObjectThumbnail(context, {");

    const queueImage = durable.indexOf("export async function queueWhatsAppImage");
    const stageBytes = durable.indexOf("await writeWhatsAppMediaObject", queueImage);
    const effectAuthority = durable.indexOf(
      "await createWhatsAppEffectAuthority",
      queueImage,
    );
    expect(queueImage).toBeGreaterThanOrEqual(0);
    expect(stageBytes).toBeGreaterThan(queueImage);
    expect(effectAuthority).toBeGreaterThan(stageBytes);
    expect(durable).toContain("strictSourceIdentity: true");
    expect(durable).toContain('effectType: WHATSAPP_IMAGE_EFFECT_TYPE');
    expect(durable).toContain('messageType: "image"');
    expect(durable).toContain("sealWhatsAppMessageAttachmentWithKey");
    expect(mediaStore).toContain("createCipheriv");
    expect(mediaStore).toContain('image: 20 * 1024 * 1024');
    expect(mediaStore).toContain("linkSync(temporary, target)");
    expect(mediaStore).toContain('"MEDIA_OBJECT_CONFLICT"');
  });

  it("keeps the image provider timeout inside a dedicated recovery lease", () => {
    const durable = source("src/lib/whatsapp/durable-send.ts");
    const sidecarClient = source("src/lib/whatsapp/sidecar-client.ts");
    const sendImageStart = sidecarClient.indexOf("sendImage: (");
    const sendImageEnd = sidecarClient.indexOf("receipt: async", sendImageStart);
    const sendImage = sidecarClient.slice(sendImageStart, sendImageEnd);

    expect(durable).toContain("const TEXT_LEASE_MS = 90_000");
    expect(durable).toContain("const IMAGE_LEASE_MS = 150_000");
    expect(durable).toContain("lockedAt: { lt: new Date(now.getTime() - IMAGE_LEASE_MS) }");
    expect(sendImage).toContain("120_000");
  });

  it("authenticates staged media before marking the provider call as started", () => {
    const durable = source("src/lib/whatsapp/durable-send.ts");
    const execute = durable.slice(
      durable.indexOf("async function executeClaimed"),
      durable.indexOf("export async function processWhatsAppEffect"),
    );

    expect(execute).toContain("await readWhatsAppMediaObject(");
    expect(execute).toContain('"OUTBOX_MEDIA_INVALID"');
    expect(execute).toContain("await markEffectStarted(context, claimed)");
    expect(execute.indexOf("await readWhatsAppMediaObject("))
      .toBeLessThan(execute.indexOf("await markEffectStarted(context, claimed)"));
    expect(execute).toContain("mediaBytes?.fill(0)");
  });

  it("keeps provider dispatch account-bound, deterministic and non-base64", () => {
    const effectAuthority = source("src/lib/whatsapp/effect-authority.ts");
    const authTokens = source("sidecars/whatsapp/auth-tokens.ts");
    const sidecarClient = source("src/lib/whatsapp/sidecar-client.ts");
    const sidecar = source("sidecars/whatsapp/index.ts");

    expect(effectAuthority).toContain(
      '"text" | "image" | "video" | "document" | "voice" | "daily-report"',
    );
    expect(authTokens).toContain("(text|image|video|document|voice|daily-report)");
    expect(sidecarClient).toContain("form.set(");
    expect(sidecarClient).toContain('"image",');
    expect(sidecarClient).toContain("new Blob(");
    expect(sidecarClient).toContain('"/send-image"');
    expect(sidecarClient).not.toContain("image.toString(\"base64\")");
    expect(sidecar).toContain('app.post("/send-image"');
    expect(sidecar).toContain("effectKeyMatchesWhatsAppAccount(effectKey, status.user.id)");
    expect(sidecar).toContain("deterministicWhatsAppMessageId(effectKey)");
    expect(sidecar).toContain("bytes.fill(0)");
  });

  it("serves outbound staged image reads only through canonical Message identity", () => {
    const projection = source(
      "src/app/api/whatsapp/chats/[jid]/messages/route.ts",
    );
    const mediaRead = source("src/lib/whatsapp/media-read-service.ts");
    const route = source("src/app/api/inbox/media/[id]/route.ts");

    expect(projection).toContain('openedAttachment.kind === "image"');
    expect(projection).toContain('"succeeded"');
    expect(projection).toContain('"receipt"');
    expect(mediaRead).toContain('message.direction === "outbound"');
    expect(mediaRead).toContain("openQueuedWhatsAppImageReceipt");
    expect(mediaRead).toContain("requiresFetchAudit: false");
    expect(route).toContain(
      "prepareInboxWhatsAppMedia(context, messageId)",
    );
    expect(route).not.toContain("objectId");
    expect(route).not.toContain("filesystem");
  });
});
