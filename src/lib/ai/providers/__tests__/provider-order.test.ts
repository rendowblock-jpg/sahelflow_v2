import { describe, expect, it } from "vitest";

import {
  AI_PROVIDER_ORDER_SETTING,
  AI_PROVIDER_ORDER_VALUES,
  parseProviderOrderSetting,
  providerOrderFor,
} from "../provider-order";

describe("ai_provider_order setting", () => {
  it("is stored under ai_provider_order", () => {
    expect(AI_PROVIDER_ORDER_SETTING).toBe("ai_provider_order");
  });

  it("defaults to groq-first when nothing is stored", () => {
    expect(parseProviderOrderSetting(null)).toBe("groq-first");
    expect(parseProviderOrderSetting(undefined)).toBe("groq-first");
    expect(parseProviderOrderSetting("")).toBe("groq-first");
  });

  it("accepts each of the three values (ignoring case and spaces)", () => {
    expect(parseProviderOrderSetting("groq-first")).toBe("groq-first");
    expect(parseProviderOrderSetting("gemini-first")).toBe("gemini-first");
    expect(parseProviderOrderSetting("openai-first")).toBe("openai-first");
    expect(parseProviderOrderSetting("  Gemini-First ")).toBe("gemini-first");
    expect(parseProviderOrderSetting(" OpenAI-First ")).toBe("openai-first");
  });

  it("lists exactly the three values, the default first", () => {
    expect([...AI_PROVIDER_ORDER_VALUES]).toEqual(["groq-first", "gemini-first", "openai-first"]);
  });

  it("falls back to groq-first for any junk value", () => {
    for (const junk of ["gemini", "groq", "openai", "chatgpt-first", "both", "1", "true", "{}", "groq-first;gemini-first", "gemini_first", "openai_first", "openai-first;groq-first"]) {
      expect(parseProviderOrderSetting(junk)).toBe("groq-first");
    }
  });

  it("turns a setting into the engine's provider order", () => {
    expect(providerOrderFor("groq-first")).toEqual(["groq", "gemini", "openai"]);
    expect(providerOrderFor("gemini-first")).toEqual(["gemini", "groq", "openai"]);
    expect(providerOrderFor("openai-first")).toEqual(["openai", "groq", "gemini"]);
  });
});
