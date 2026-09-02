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

  it("records voice notes in the composer and hands them to the durable send path", () => {
    const recorder = source("src/components/inbox/use-voice-recorder.ts");
    const gestures = source("src/components/inbox/voice-recording-gestures.ts");
    const thread = source("src/components/inbox/inbox-v3-thread.tsx");
    const config = source("src-tauri/tauri.conf.json");

    // The recorder produces WhatsApp voice-note truth (OGG/Opus) or fails
    // closed with an honest message — it never uploads a foreign container.
    // Evergreen Chromium/WebView2 cannot record OGG, so WebM/Opus takes are
    // remuxed to RFC 7845 Ogg Opus before the durable send path.
    expect(recorder).toContain("VOICE_RECORDING_MIME_CANDIDATES");
    expect(recorder).toContain('"audio/ogg;codecs=opus"');
    expect(recorder).toContain('"audio/webm;codecs=opus"');
    expect(recorder).toContain("remuxWebmOpusToOgg");
    expect(recorder).toContain("MediaRecorder.isTypeSupported");
    expect(recorder).toContain("getUserMedia");
    expect(recorder).toContain("MAX_RECORDING_MS");
    expect(recorder).toContain("voiceNoteFileName");
    // Ledger INB-24: the take first lands in the preview surface (blob URL);
    // the container remux happens only when the seller confirms the send.
    expect(recorder).toContain("URL.createObjectURL");
    expect(recorder).toContain('setState("review")');
    expect(recorder).toContain("confirmSend");
    expect(recorder).toContain("discard");
    // The mic button starts the recorder; it no longer opens the file dialog.
    expect(thread).toContain("void voiceRecorder.start()");
    expect(thread).toContain("void voiceRecorder.start();");
    // Ledger INB-24 disposition: the recording-state check button finishes
    // into the preview and the review send button (confirmSend) enters the
    // durable path — the direct `stopAndSend` onClick pin is superseded.
    expect(thread).toContain("onClick={voiceRecorder.confirmSend}");
    expect(thread).toContain("onClick={voiceRecorder.finish}");
    expect(thread).toContain("onClick={voiceRecorder.cancel}");
    expect(thread).toContain("onClick={voiceRecorder.discard}");
    expect(thread).toContain('data-inbox-voice-recorder={voiceRecorder.state}');
    expect(thread).toContain('data-inbox-voice-send="true"');
    expect(thread).toContain('data-inbox-voice-cancel="true"');
    expect(thread).toContain('data-inbox-voice-finish="true"');
    expect(thread).toContain('data-inbox-voice-discard="true"');
    expect(thread).toContain('data-inbox-voice-review="true"');
    // WhatsApp gestures: hold-to-record with slide-up lock, slide-to-cancel
    // and preview-before-send, decided by the pure gesture module.
    expect(gestures).toContain("VOICE_LOCK_RISE_PX = 48");
    expect(gestures).toContain("VOICE_SLIDE_CANCEL_PX = 96");
    expect(gestures).toContain("VOICE_TAP_MAX_MS = 500");
    expect(thread).toContain("decideRecordingPointerUp");
    expect(thread).toContain("decideSlideCancel");
    expect(thread).toContain("setPointerCapture");
    // The preview plays through the shared WhatsApp-grade player (R5-e), not
    // a bare <audio controls>.
    expect(thread).toContain("<VoiceNotePlayer");
    expect(thread).not.toContain("<audio controls");
    expect(thread).not.toContain(
      "data-inbox-audio-picker=\"true\"\n                    onClick={() => audioInputRef.current?.click()}",
    );
    // WebView2 must auto-grant the microphone permission request for the
    // in-composer recorder; the flag set extends the wry defaults.
    expect(config).toContain("--use-fake-ui-for-media-stream");
    expect(config).toContain("--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection");
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
