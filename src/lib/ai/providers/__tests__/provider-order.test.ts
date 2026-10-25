import { describe, expect, it } from "vitest";

import {
  AI_PROVIDER_ORDER_SETTING,
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

  it("accepts each of the two values (ignoring case and spaces)", () => {
    expect(parseProviderOrderSetting("groq-first")).toBe("groq-first");
    expect(parseProviderOrderSetting("gemini-first")).toBe("gemini-first");
    expect(parseProviderOrderSetting("  Gemini-First ")).toBe("gemini-first");
  });

  it("falls back to groq-first for any junk value", () => {
    for (const junk of ["gemini", "groq", "both", "1", "true", "{}", "groq-first;gemini-first", "gemini_first"]) {
      expect(parseProviderOrderSetting(junk)).toBe("groq-first");
    }
  });

  it("turns a setting into the engine's provider order", () => {
    expect(providerOrderFor("groq-first")).toEqual(["groq", "gemini"]);
    expect(providerOrderFor("gemini-first")).toEqual(["gemini", "groq"]);
  });
});
