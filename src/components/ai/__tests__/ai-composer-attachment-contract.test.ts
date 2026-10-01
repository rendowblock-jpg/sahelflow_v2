import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { getAiWorkspaceCopy } from "@/lib/i18n/ai-workspace";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const LOCALES = ["en", "fr", "ar"] as const;

/**
 * Ledger AI-21 — the agents composer reaches the proven extraction stack
 * through one bounded, consent-gated, rate-limited visual route; the canvas
 * never auto-sends an extracted order (review-before-send stays design law).
 */
describe("AI composer images and screenshot reading (AI-21)", () => {
  it("extracts screenshots through the same bounded extraction authority", () => {
    const extractor = source("src/lib/ai/extraction/image-extractor.ts");
    const router = source("src/lib/ai/extraction/smart-router.ts");

    // One extraction truth: the visual path reuses the text extractor's
    // bounded zod schema and JSON response schema verbatim.
    expect(extractor).toContain("ExtractedOrderSchema");
    expect(extractor).toContain("responseSchema");
    expect(extractor).toContain('"image/jpeg"');
    expect(extractor).toContain('"image/png"');
    expect(extractor).toContain('"image/webp"');
    expect(extractor).toContain(
      "MAX_EXTRACTION_IMAGE_BYTES = 10 * 1024 * 1024",
    );
    expect(router).toContain("extractOrderFromImage");
    // Honest routing: no regex fallback exists for pixels — no fabricated
    // order can leave the visual path.
    expect(router).toContain("NO regex fallback for screenshots");
  });

  it("bounds, sniffs and gates the visual route before any provider call", () => {
    const route = source("src/app/api/extraction/image/route.ts");

    // Bounded multipart at the door (same pattern as the WhatsApp voice
    // route) — never an unbounded formData materialization.
    expect(route).toContain("MAX_IMAGE_FORM_BYTES");
    expect(route).toContain("req.body.getReader()");
    expect(route).not.toContain("await req.formData()");
    // fix-B6 informed-consent gate, identical code to the text route.
    expect(route).toContain('code: "AI_CONSENT_REQUIRED"');
    expect(route).toContain("SETTING_KEYS.geminiConsentAccepted");
    // AI-M1 quota protection with the per-user bucket.
    expect(route).toContain("checkRateLimit");
    expect(route).toContain("getCurrentUserKey");
    // Container truth: browser declarations never become authority.
    expect(route).toContain("function sniffImageType");
    expect(route).toContain('return "image/jpeg"');
    expect(route).toContain('return "image/png"');
    expect(route).toContain('return "image/webp"');
    // Screenshot bytes are never persisted.
    expect(route).toContain("bytes.fill(0)");
    expect(route).toContain("recordExtractionMetric");
    expect(route).toContain("requireAuth");
  });

  it("keeps read-as-order review-first inside the image tray", () => {
    // Agents image input: images attach to the message; reading one as an
    // order stays an explicit per-image action whose summary lands in the
    // DRAFT for review — nothing is ever sent from the extraction path.
    const deck = source("src/components/ai/ai-composer-deck.tsx");
    const tray = source("src/components/ai/ai-image-tray.tsx");
    const canvas = source("src/components/ai/ai-decision-canvas.tsx");

    expect(deck).toContain('data-ai-composer-attach="true"');
    expect(deck).toContain('data-ai-image-input="true"');
    expect(deck).toContain("accept={AI_CHAT_ATTACHMENT_ACCEPT}");
    expect(deck).toContain("tray.addFiles(files)");
    expect(tray).toContain('data-ai-image-chip="true"');
    expect(tray).toContain('data-ai-image-remove="true"');
    expect(tray).toContain('data-ai-image-extract="true"');
    expect(tray).toContain('"/api/extraction/image"');
    // Consent and rate-limit failures reuse the exact chat-send copy.
    expect(tray).toContain('copy("consentMissing")');
    expect(tray).toContain('copy("rateLimited")');
    expect(tray).toContain("function screenshotSummary");
    expect(tray).toContain("setDraft((current) =>");
    expect(tray).not.toContain("onSend(summary)");
    expect(canvas).not.toContain("onSend(summary)");
    // The canvas owns the draft and hands it to the deck — one text truth.
    expect(canvas).toContain("<AiComposerDeck");
    expect(canvas).toContain("setDraft={setDraft}");
  });

  it("sends images with the turn under one bound, sniffed and sealed", () => {
    const limits = source("src/lib/ai/chat/attachment-limits.ts");
    const store = source("src/lib/ai/chat/attachments.ts");
    const route = source("src/app/api/ai/sessions/[id]/messages/stream/route.ts");
    const agent = source("src/lib/ai/chat/agent.ts");
    const read = source("src/app/api/ai/attachments/[id]/route.ts");

    // One bound for picker and route.
    expect(limits).toContain("AI_CHAT_ATTACHMENT_MAX_COUNT = 4");
    expect(limits).toContain("AI_CHAT_ATTACHMENT_MAX_BYTES = 4 * 1024 * 1024");
    expect(limits).toContain('"image/jpeg"');
    expect(limits).toContain('"image/png"');
    expect(limits).toContain('"image/webp"');
    // Container truth: the declared type must match the sniffed bytes.
    expect(store).toContain("sniffAiChatImageType(bytes) !== input.mediaType");
    // Sealed at rest, bound to row id + media type.
    expect(store).toContain('"aes-256-gcm"');
    expect(store).toContain("getBusinessEnvelopeKey");
    expect(store).toContain("setAAD(attachmentAad(");
    // The route validates before anything is stored or sent.
    expect(route).toContain("decodeAiChatImages(input.attachments)");
    expect(route.indexOf("decodeAiChatImages(input.attachments)")).toBeLessThan(
      route.indexOf("aiChatMessage.create"),
    );
    expect(route).toContain('"AI_ATTACHMENT_INVALID"');
    // Consent gate precedes any image handling.
    expect(route.indexOf("SETTING_KEYS.geminiConsentAccepted")).toBeLessThan(
      route.indexOf("decodeAiChatImages(input.attachments)"),
    );
    // The model receives the pixels as inline data with the turn.
    expect(agent).toContain("inlineData");
    // Reading an image back needs the same authority as the conversation.
    expect(read).toContain('requireAuth("ai.use")');
    expect(read).toContain("nosniff");
  });

  it("ships every composer-attachment key in en/fr/ar", () => {
    const keys = [
      "attachImages",
      "imageRemove",
      "imageAlt",
      "imageUnsupported",
      "imageTooLarge",
      "imageLimit",
      "imageRejected",
      "extractOrderFromImage",
      "screenshotExtractFailed",
    ] as const;
    for (const key of keys) {
      for (const locale of LOCALES) {
        expect(getAiWorkspaceCopy(locale, key), `${locale}:${key}`).toBeTruthy();
      }
    }
    expect(getAiWorkspaceCopy("fr", "imageTooLarge")).toContain("{limit}");
    expect(getAiWorkspaceCopy("en", "attachImages")).toBe("Attach images");
  });
});
