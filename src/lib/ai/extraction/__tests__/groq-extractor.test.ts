/** extractWithGroq: same ExtractionResult contract as extractWithGemini; fetch is always mocked. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({ logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { extractWithGroq } from "../groq-extractor";
import type { ExtractionInput } from "../types";

const KEY = ["gsk", "_", "FakeFakeFakeFakeFakeFake1234567890"].join("");
const INPUT: ExtractionInput = { body: "بغيت نشرى iPhone 14 ب 85000 دج، التوصيل ل Alger، رقمي 0661234567" };
const fetchSpy = vi.fn();
const completion = (content: unknown) =>
  new Response(JSON.stringify({ choices: [{ message: { content } }], usage: { prompt_tokens: 3334, completion_tokens: 50 } }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });

beforeEach(() => { fetchSpy.mockReset(); vi.stubGlobal("fetch", fetchSpy); });
afterEach(() => vi.unstubAllGlobals());

describe("extractWithGroq", () => {
  it("returns a groq-method order, canonicalised like the Gemini path", async () => {
    fetchSpy.mockResolvedValue(completion(JSON.stringify({
      customerName: "Ahmed", phone: "+213 661 23 45 67", wilaya: "alger", commune: "Bab Ezzouar",
      items: [{ productName: "iPhone 14", quantity: "2" }],
    })));
    const result = await extractWithGroq(INPUT, { apiKey: KEY });
    expect(result.method).toBe("groq");
    expect(result.order?.phone).toBe("0661234567");
    expect(result.order?.wilaya).toBeTruthy();
    expect(result.order?.items).toEqual([{ productName: "iPhone 14", quantity: 2 }]);
    expect(result.isComplete).toBe(true);
    expect(result.raw).toMatchObject({ model: "qwen/qwen3.8-27b" });
  });

  it("sends the measured request body", async () => {
    fetchSpy.mockResolvedValue(completion('{"items":[]}'));
    await extractWithGroq({ ...INPUT, catalog: [{ name: "iPhone 14" }] }, { apiKey: KEY });
    const sent = JSON.parse((fetchSpy.mock.calls[0]?.[1] as { body: string }).body);
    expect(sent).toMatchObject({
      model: "qwen/qwen3.8-27b",
      response_format: { type: "json_object" },
      reasoning_effort: "none",
      temperature: 0,
      max_completion_tokens: 800,
    });
    expect(sent.messages.map((m: { role: string }) => m.role)).toEqual(["system", "user"]);
    expect(sent.messages[1].content).toContain("iPhone 14");
  });

  it("marks missing fields like the Gemini path", async () => {
    fetchSpy.mockResolvedValue(completion('{"items":[{"productName":"x","quantity":1}]}'));
    const result = await extractWithGroq(INPUT, { apiKey: KEY });
    expect(result.isComplete).toBe(false);
    expect(result.missingFields).toEqual(["wilaya", "phone"]);
  });

  it("reports a quota failure as the first missing field and keeps the delay", async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ error: { message: "limit" } }), { status: 429, headers: { "retry-after": "42" } }));
    const result = await extractWithGroq(INPUT, { apiKey: KEY });
    expect(result.order).toBeNull();
    expect(result.method).toBe("none");
    expect(result.missingFields?.[0]).toBe("GROQ_QUOTA_EXHAUSTED");
    expect(result.raw).toEqual({ retryAfterSeconds: 42 });
  });

  it("names the key problems and bad answers", async () => {
    expect((await extractWithGroq(INPUT, { apiKey: "" })).missingFields?.[0]).toBe("GROQ_KEY_MISSING");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockResolvedValueOnce(new Response("{}", { status: 401 }));
    expect((await extractWithGroq(INPUT, { apiKey: KEY })).missingFields?.[0]).toBe("GROQ_KEY_INVALID");
    fetchSpy.mockResolvedValueOnce(completion(""));
    expect((await extractWithGroq(INPUT, { apiKey: KEY })).missingFields?.[0]).toBe("GROQ_EMPTY_RESPONSE");
    fetchSpy.mockResolvedValueOnce(completion("not json"));
    expect((await extractWithGroq(INPUT, { apiKey: KEY })).missingFields?.[0]).toBe("GROQ_INVALID_EXTRACTION");
    fetchSpy.mockResolvedValueOnce(completion('{"items":"nope"}'));
    expect((await extractWithGroq(INPUT, { apiKey: KEY })).missingFields?.[0]).toBe("GROQ_INVALID_EXTRACTION");
  });
});
