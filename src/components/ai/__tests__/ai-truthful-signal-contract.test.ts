import { describe, expect, it } from "vitest";

import {
  parseTurnSignal,
} from "@/components/ai/ai-workspace-types";
import { getAiWorkspaceCopy } from "@/lib/i18n/ai-workspace";

/**
 * Ledger AI-26 — truthful model/quality signal. The line under an assistant
 * answer exists ONLY when the provider actually reported the turn; every
 * value comes from the provider itself. Nothing is ever estimated.
 */
describe("truthful AI turn signal (AI-26)", () => {
  it("keeps provider-shaped signals and drops everything else", () => {
    expect(parseTurnSignal(undefined)).toBeUndefined();
    expect(parseTurnSignal(null)).toBeUndefined();
    expect(parseTurnSignal("gemini-3.5-flash")).toBeUndefined();
    expect(parseTurnSignal({})).toBeUndefined();
    expect(parseTurnSignal({ model: "" })).toBeUndefined();
    // Malformed counts are dropped; the model id alone survives.
    expect(parseTurnSignal({ model: "gemini-3.5-flash", totalTokens: "lots" })).toEqual(
      { model: "gemini-3.5-flash" },
    );
    expect(
      parseTurnSignal({ model: "gemini-3.5-flash", totalTokens: -5 }),
    ).toEqual({ model: "gemini-3.5-flash" });
  });

  it("preserves exactly the fields the provider reported", () => {
    expect(
      parseTurnSignal({
        model: "gemini-3.5-flash",
        promptTokens: 120,
        candidateTokens: 45,
        totalTokens: 165,
      }),
    ).toEqual({
      model: "gemini-3.5-flash",
      promptTokens: 120,
      candidateTokens: 45,
      totalTokens: 165,
    });
    expect(
      parseTurnSignal({ model: "gemini-3.6-flash", totalTokens: 42 }),
    ).toEqual({ model: "gemini-3.6-flash", totalTokens: 42 });
  });

  it("localizes the signal copy in en/fr/ar with interpolation", () => {
    expect(
      getAiWorkspaceCopy("en", "modelSignal", {
        model: "gemini-3.5-flash",
        tokens: 165,
      }),
    ).toBe("Served by gemini-3.5-flash · 165 tokens");
    expect(
      getAiWorkspaceCopy("fr", "modelSignalModelOnly", { model: "m" }),
    ).toBe("Servi par m");
    expect(getAiWorkspaceCopy("ar", "modelSignalModelOnly", { model: "m" })).toBe(
      "تمت الإجابة بواسطة m",
    );
    expect(getAiWorkspaceCopy("fr", "modelSignal", { model: "m", tokens: 9 })).toContain(
      "9 jetons",
    );
  });
});
