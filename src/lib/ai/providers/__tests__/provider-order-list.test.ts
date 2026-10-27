import { describe, expect, it } from "vitest";
import { parseProviderOrder, parseProviderOrderSetting, providerOrderFor } from "../provider-order";

describe("provider order with three providers", () => {
  it("the old values keep working and the default is groq, gemini, openai", () => {
    expect(parseProviderOrder(null)).toEqual(["groq", "gemini", "openai"]);
    expect(parseProviderOrder("groq-first")).toEqual(["groq", "gemini", "openai"]);
    expect(parseProviderOrder("gemini-first")).toEqual(["gemini", "groq", "openai"]);
    expect(providerOrderFor("gemini-first")).toEqual(["gemini", "groq", "openai"]);
    expect(parseProviderOrderSetting("gemini-first")).toBe("gemini-first");
    expect(parseProviderOrderSetting('["openai"]')).toBe("groq-first");
  });
  it("openai-first is the list openai, groq, gemini", () => {
    expect(parseProviderOrder("openai-first")).toEqual(["openai", "groq", "gemini"]);
    expect(parseProviderOrder(" OpenAI-First ")).toEqual(["openai", "groq", "gemini"]);
    expect(providerOrderFor("openai-first")).toEqual(["openai", "groq", "gemini"]);
    expect(parseProviderOrderSetting("openai-first")).toBe("openai-first");
  });
  it("accepts an ordered list (JSON or comma), completes it, drops junk and repeats", () => {
    expect(parseProviderOrder('["openai","groq","gemini"]')).toEqual(["openai", "groq", "gemini"]);
    expect(parseProviderOrder("openai, gemini")).toEqual(["openai", "gemini", "groq"]);
    expect(parseProviderOrder('["gemini","gemini","bogus",7]')).toEqual(["gemini", "groq", "openai"]);
  });
  it("junk means the default", () => {
    for (const junk of ["", "   ", "nonsense", "[", '{"a":1}', "[]", "bogus,other"]) {
      expect(parseProviderOrder(junk)).toEqual(["groq", "gemini", "openai"]);
    }
  });
});
