import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("WhatsApp outbound video source boundary", () => {
  it("exposes one bounded MP4 picker and the durable send monitor", () => {
    const thread = source("src/components/inbox/inbox-v3-thread.tsx");
    const workspace = source("src/hooks/use-inbox-workspace.ts");

    expect(thread).toContain('accept="video/mp4"');
    expect(thread).toContain('data-inbox-video-picker="true"');
    expect(thread).toContain('aria-label={copy("mediaVideo")}');
    expect(thread).toContain("void sendVideo(file)");
    expect(workspace).toContain("MAX_OUTBOUND_VIDEO_BYTES = 64 * 1024 * 1024");
    expect(workspace).toContain('fetch("/api/whatsapp/send-video"');
    expect(workspace).toContain('form.set("video", file');
    expect(workspace).toContain("void monitorWhatsAppEffect(");
  });

  it("treats generic browser MIME as a hint while authenticating MP4 bytes", () => {
    const thread = source("src/components/inbox/inbox-v3-thread.tsx");
    const workspace = source("src/hooks/use-inbox-workspace.ts");
    const mediaStore = source("src/lib/whatsapp/media-object-store.ts");

    expect(thread).toContain('declaredType !== "application/octet-stream"');
    expect(thread).toContain('fileType !== "ftyp"');
    expect(thread).toContain('type: "video/mp4"');
    expect(workspace).toContain('mediaType !== "video/mp4"');
    expect(mediaStore).toContain('kind === "video"');
    expect(mediaStore).toContain('sniffed === "video/mp4"');
  });

  it("validates duration before encrypted staging and provider effect", () => {
    const durable = source("src/lib/whatsapp/durable-send.ts");
    const queueStart = durable.indexOf("export async function queueWhatsAppVideo");
    const queueEnd = durable.indexOf("async function recoverPreEffectLease", queueStart);
    const queue = durable.slice(queueStart, queueEnd);

    expect(queue).toContain("input.source.tee()");
    expect(queue).toContain("inspectOutboundVideoDuration(metadataSource");
    expect(queue).toContain("await writeWhatsAppMediaObject(context");
    expect(queue.indexOf("inspectOutboundVideoDuration(metadataSource")).toBeLessThan(
      queue.indexOf("await writeWhatsAppMediaObject(context"),
    );
    expect(durable).toContain("WhatsApp videos must have a verified positive duration");
    expect(durable).toContain("{ duration: true, skipCovers: true }");
  });

  it("bounds both multipart hops before form-data materialization", () => {
    const route = source("src/app/api/whatsapp/send-video/route.ts");
    const sidecar = source("sidecars/whatsapp/index.ts");

    expect(route).toContain("MAX_VIDEO_FORM_BYTES");
    expect(route).toContain("req.body.getReader()");
    expect(route).not.toContain("await req.formData()");
    expect(sidecar).toContain("MAX_OUTBOUND_VIDEO_FORM_BYTES");
    expect(sidecar).toContain("readBoundedVideoForm(context.req.raw)");
    expect(sidecar).not.toContain("context.req.raw.formData()");
  });

  it("keeps staged video bytes canonical, account-bound and non-base64", () => {
    const route = source("src/app/api/whatsapp/send-video/route.ts");
    const durable = source("src/lib/whatsapp/durable-send.ts");
    const sidecarClient = source("src/lib/whatsapp/sidecar-client.ts");
    const sidecar = source("sidecars/whatsapp/index.ts");
    const mediaRead = source("src/lib/whatsapp/media-read-service.ts");
    const queue = source("src/lib/whatsapp/outbound-video-queue.ts");

    expect(route).toContain('requireTrustedAction("conversations.reply")');
    expect(route).toContain('"customers.contact.read"');
    expect(route).toContain("queueWhatsAppVideo(context");
    expect(durable).toContain('effectType: WHATSAPP_VIDEO_EFFECT_TYPE');
    expect(durable).toContain('messageType: "video"');
    expect(durable).toContain('kind: "video"');
    expect(sidecarClient).toContain('"/send-video"');
    expect(sidecarClient).not.toContain('video.toString("base64")');
    expect(sidecar).toContain('app.post("/send-video"');
    expect(sidecar).toContain("deterministicWhatsAppMessageId(effectKey)");
    expect(mediaRead).toContain("openQueuedWhatsAppVideoReceipt");
    expect(queue).toContain("withWhatsAppMediaLifecycleLease(");
    expect(queue).toContain("whatsAppMediaRoot(context)");
  });

  it("authenticates encrypted media before the provider-start boundary", () => {
    const durable = source("src/lib/whatsapp/durable-send.ts");
    const execute = durable.slice(
      durable.indexOf("async function executeClaimed"),
      durable.indexOf("export async function processWhatsAppEffect"),
    );

    expect(execute).toContain('kind =');
    expect(execute).toContain('"image" : "video"');
    expect(execute).toContain("await readWhatsAppMediaObject(");
    expect(execute.indexOf("await readWhatsAppMediaObject(")).toBeLessThan(
      execute.indexOf("await markEffectStarted(context, claimed)"),
    );
    expect(execute).toContain("mediaBytes?.fill(0)");
  });
});
