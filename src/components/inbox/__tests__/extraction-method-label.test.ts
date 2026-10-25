import { describe, expect, it } from "vitest";

import { extractionMethodLabelKey } from "@/components/inbox/extraction-ai-line";
import { getOrderExtractionCopy, type OrderExtractionLocale } from "@/lib/i18n/order-extraction";

/** The card names the provider that really read the message: a Groq read must not say "Gemini". */
describe("extractionMethodLabelKey", () => {
  it("maps each reader to its own label", () => {
    expect(extractionMethodLabelKey("gemini")).toBe("methodGemini");
    expect(extractionMethodLabelKey("groq")).toBe("methodGroq");
    expect(extractionMethodLabelKey("regex")).toBe("methodOffline");
    expect(extractionMethodLabelKey("anything-else")).toBe("methodOffline");
  });

  it.each(["fr", "ar", "en"] as OrderExtractionLocale[])("%s: the Groq label names Groq and not Gemini", (locale) => {
    const groq = getOrderExtractionCopy(locale, "methodGroq");
    expect(groq).toContain("Groq");
    expect(groq).not.toContain("Gemini");
    expect(getOrderExtractionCopy(locale, "methodGemini")).toContain("Gemini");
  });
});
