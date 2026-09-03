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
describe("AI composer screenshot attachment (AI-21)", () => {
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

  it("wires the composer attach/paste path with a review-first summary", () => {
    const canvas = source("src/components/ai/ai-decision-canvas.tsx");

    expect(canvas).toContain('data-ai-composer-attach="true"');
    expect(canvas).toContain('data-ai-screenshot-input="true"');
    expect(canvas).toContain('data-ai-screenshot-chip="true"');
    expect(canvas).toContain('data-ai-screenshot-remove="true"');
    expect(canvas).toContain('accept={SCREENSHOT_ACCEPT}');
    expect(canvas).toContain("ingestScreenshot(file)");
    expect(canvas).toContain('"/api/extraction/image"');
    // Consent and rate-limit failures reuse the exact chat-send copy.
    expect(canvas).toContain('copy("consentMissing")');
    expect(canvas).toContain('copy("rateLimited")');
    // The extraction result is appended to the DRAFT for review; nothing is
    // auto-sent from the extraction flow.
    expect(canvas).toContain("function screenshotSummary");
    expect(canvas).toContain("setDraft((current) =>");
    expect(canvas).not.toContain("onSend(summary)");
    // Client picker boundaries mirror the route authority (pinned values).
    expect(canvas).toContain("const SCREENSHOT_MAX_BYTES = 10 * 1024 * 1024;");
    expect(canvas).toContain('"image/jpeg", "image/png", "image/webp"');
  });

  it("ships every composer-attachment key in en/fr/ar", () => {
    const keys = [
      "attachScreenshot",
      "readingScreenshot",
      "screenshotRemove",
      "screenshotUnsupported",
      "screenshotTooLarge",
      "screenshotExtractFailed",
    ] as const;
    for (const key of keys) {
      for (const locale of LOCALES) {
        expect(getAiWorkspaceCopy(locale, key), `${locale}:${key}`).toBeTruthy();
      }
    }
    expect(getAiWorkspaceCopy("fr", "screenshotTooLarge")).toContain("{limit}");
    expect(getAiWorkspaceCopy("en", "attachScreenshot")).toBe(
      "Attach screenshot",
    );
  });
});
