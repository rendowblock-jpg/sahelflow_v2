/** A Google 429 says how long to wait (RetryInfo); the provider error now carries it. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({ logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { GeminiProviderError, requestGemini } from "@/lib/ai/gemini/provider";

const KEY = ["AI", "za", "SyFakeFakeFakeFakeFakeFake12345678"].join("");
const fetchSpy = vi.fn();
// A fresh Response per call: requestGemini asks both models and a body can be read once.
const answer = (body: unknown, status = 429) => () =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function failure(): Promise<GeminiProviderError> {
  try {
    await requestGemini(KEY, { body: {}, maxAttemptsPerModel: 1 });
  } catch (e) {
    return e as GeminiProviderError;
  }
  throw new Error("expected a GeminiProviderError");
}

beforeEach(() => { fetchSpy.mockReset(); vi.stubGlobal("fetch", fetchSpy); });
afterEach(() => vi.unstubAllGlobals());

describe("Gemini 429 RetryInfo", () => {
  it("reads retryDelay from error.details", async () => {
    fetchSpy.mockImplementation(answer({ error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "Quota exceeded",
      details: [
        { "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [] },
        { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "57173s" },
      ] } }));
    const error = await failure();
    expect(error.code).toBe("GEMINI_QUOTA_EXHAUSTED");
    expect(error.retryAfterSeconds).toBe(57173);
  });

  it("rounds a fractional delay up", async () => {
    fetchSpy.mockImplementation(answer({ error: { status: "RESOURCE_EXHAUSTED", message: "x",
      details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "12.3s" }] } }));
    expect((await failure()).retryAfterSeconds).toBe(13);
  });

  it("falls back to 'Please retry in 12.3s' in the message", async () => {
    fetchSpy.mockImplementation(answer({ error: { status: "RESOURCE_EXHAUSTED", message: "You exceeded your quota. Please retry in 12.3s." } }));
    expect((await failure()).retryAfterSeconds).toBe(13);
  });

  it("leaves it undefined when Google gave no delay", async () => {
    fetchSpy.mockImplementation(answer({ error: { status: "RESOURCE_EXHAUSTED", message: "Quota exceeded" } }));
    const error = await failure();
    expect(error.code).toBe("GEMINI_QUOTA_EXHAUSTED");
    expect(error.retryAfterSeconds).toBeUndefined();
  });
});
