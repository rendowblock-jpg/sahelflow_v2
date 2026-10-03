import { describe, expect, it } from "vitest";

import {
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GEMINI_THINKING_LEVEL,
  GEMINI_MODELS,
  geminiModelFallbackOrder,
  parseGeminiModel,
  parseGeminiThinkingLevel,
} from "../catalog";

describe("Gemini seller catalog", () => {
  it("falls back to the default model and thinking level", () => {
    expect(parseGeminiModel(null)).toBe(DEFAULT_GEMINI_MODEL);
    expect(parseGeminiModel("gemini-unknown")).toBe(DEFAULT_GEMINI_MODEL);
    expect(parseGeminiThinkingLevel(undefined)).toBe(
      DEFAULT_GEMINI_THINKING_LEVEL,
    );
    expect(parseGeminiThinkingLevel("deep")).toBe(DEFAULT_GEMINI_THINKING_LEVEL);
  });

  it("accepts a seller-chosen model and thinking level", () => {
    expect(parseGeminiModel("gemini-3.6-flash")).toBe("gemini-3.6-flash");
    expect(parseGeminiThinkingLevel("high")).toBe("HIGH");
    expect(parseGeminiThinkingLevel("MINIMAL")).toBe("MINIMAL");
  });

  it("tries the seller model first and keeps the other as fallback", () => {
    expect(geminiModelFallbackOrder("gemini-3.6-flash")).toEqual([
      "gemini-3.6-flash",
      "gemini-3.5-flash",
    ]);
    expect(geminiModelFallbackOrder(null)[0]).toBe(GEMINI_MODELS[0]);
  });
});
