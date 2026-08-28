import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("WhatsApp outbound voice source boundary", () => {
  it("exposes one bounded audio picker and the durable send monitor", () => {
    const thread = source("src/components/inbox/inbox-v3-thread.tsx");
    const workspace = source("src/hooks/use-inbox-workspace.ts");

    expect(thread).toContain('data-inbox-audio-picker="true"');
    expect(thread).toContain('data-inbox-audio-input="true"');
    expect(thread).toContain('aria-label={copy("mediaAudio")}');
    expect(thread).toContain("void sendVoice(file, quotedId)");
    expect(workspace).toContain(
      "MAX_OUTBOUND_VOICE_BYTES = 32 * 1024 * 1024",
    );
    expect(workspace).toContain('"/api/whatsapp/send-voice"');
    expect(workspace).toContain('form.set("audio", file');
    expect(workspace).toContain("void monitorWhatsAppEffect(");
  });

  it("allows only the bounded authenticated audio declaration set", () => {
    const route = source("src/app/api/whatsapp/send-voice/route.ts");
    const workspace = source("src/hooks/use-inbox-workspace.ts");

    expect(route).toContain('"audio/ogg"');
    expect(route).toContain('"audio/mpeg"');
    expect(route).toContain('"audio/mp4"');
    expect(route).toContain("!SAFE_VOICE_TYPES.has(mediaType)");
    expect(workspace).toContain("!SAFE_OUTBOUND_VOICE_TYPES.has(mediaType)");
  });

  it("authenticates container metadata before staging and seals the PTT truth", () => {
    const durable = source("src/lib/whatsapp/durable-send.ts");
    const queueStart = durable.indexOf(
      "export async function queueWhatsAppVoice",
    );
    const queueEnd = durable.indexOf(
      "async function recoverPreEffectLease",
      queueStart,
    );
    const queue = durable.slice(queueStart, queueEnd);

    expect(queue).toContain('kind: "audio"');
    expect(queue).toContain("await writeWhatsAppMediaObject(context");
    expect(queue).toContain("createWhatsAppEffectAuthority");
    expect(queue.indexOf("await writeWhatsAppMediaObject(context")).toBeLessThan(
      queue.indexOf("createWhatsAppEffectAuthority"),
    );
    expect(queue).toContain(
      "await inspectOutboundVoiceMetadata(",
    );
    expect(queue.indexOf("await inspectOutboundVoiceMetadata(")).toBeLessThan(
      queue.indexOf("await writeWhatsAppMediaObject(context"),
    );
    expect(queue).toContain("await discardStagedMediaIfUnreferenced(context, clientMessageId)");
    expect(queue).toContain("attachmentKey.fill(0)");
    expect(durable).toContain('messageType: "audio"');
    expect(durable).toContain("effectType: WHATSAPP_VOICE_EFFECT_TYPE");
    expect(durable).toContain('"whatsapp.voice.send.v1"');
    expect(durable).toContain("WhatsApp voice notes must contain Opus audio");
    expect(durable).toContain(
      "WhatsApp audio must not contain a video track",
    );
  });

  it("bounds both multipart hops before form-data materialization", () => {
    const route = source("src/app/api/whatsapp/send-voice/route.ts");
    const sidecar = source("sidecars/whatsapp/index.ts");
    const sidecarClient = source("src/lib/whatsapp/sidecar-client.ts");

    expect(route).toContain("MAX_VOICE_FORM_BYTES");
    expect(route).toContain("req.body.getReader()");
    expect(route).not.toContain("await req.formData()");
    expect(sidecar).toContain("MAX_OUTBOUND_VOICE_FORM_BYTES");
    expect(sidecar).toContain("readBoundedVoiceForm(context.req.raw)");
    expect(sidecar).not.toContain("context.req.raw.formData()");
    expect(sidecarClient).toContain('"/send-voice"');
    expect(sidecarClient).not.toContain('.toString("base64")');
  });

  it("keeps staged voice bytes canonical, account-bound and dispatchable", () => {
    const durable = source("src/lib/whatsapp/durable-send.ts");
    const sidecar = source("sidecars/whatsapp/index.ts");
    const wa = source("sidecars/whatsapp/whatsapp.ts");
    const mediaRead = source("src/lib/whatsapp/media-read-service.ts");
    const queue = source("src/lib/whatsapp/outbound-voice-queue.ts");
    const authority = source("src/lib/whatsapp/effect-authority.ts");

    expect(sidecar).toContain('app.post("/send-voice"');
    expect(sidecar).toContain("voiceEffectKey(effectKey)");
    expect(sidecar).toContain("deterministicWhatsAppMessageId(effectKey)");
    expect(sidecar).toContain("bytes.fill(0)");
    expect(wa).toContain("async sendVoice(");
    expect(wa).toContain('"audio/ogg; codecs=opus"');
    expect(mediaRead).toContain("openQueuedWhatsAppVoiceReceipt");
    expect(queue).toContain("withWhatsAppMediaLifecycleLease(");
    expect(queue).toContain("whatsAppMediaRoot(context)");
    expect(authority).toContain('"voice"');
    expect(durable).toContain('"whatsapp_voice.queue.v1"');
  });

  it("extends the durable effect pattern and lease recovery for voice", () => {
    const authTokens = source("sidecars/whatsapp/auth-tokens.ts");
    const durable = source("src/lib/whatsapp/durable-send.ts");

    expect(authTokens).toContain("(text|image|video|document|voice|daily-report)");
    expect(durable).toContain("WHATSAPP_VOICE_EFFECT_TYPE");
    expect(durable).toContain("VOICE_LEASE_MS");
  });
});
