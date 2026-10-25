/**
 * A quota answer is not a hiccup: asking the same model again 750 ms later only costs another request
 * (measured on the free tier: 20 a day per model, and the two catalog models share one bucket).
 * The quota ledger already pauses the provider; the request layer must not add retries of its own.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({ logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { GEMINI_MODELS, requestGemini } from "@/lib/ai/gemini/provider";

const KEY = ["AI", "za", "SyFakeFakeFakeFakeFakeFake12345678"].join("");
const fetchSpy = vi.fn();
// A fresh Response per call: a body can be read once.
const answer = (status: number, body: unknown) => () =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  fetchSpy.mockReset();
  vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("requestGemini and quota answers", () => {
  it("asks each model once on a 429 with the default attempts, not twice", async () => {
    fetchSpy.mockImplementation(answer(429, { error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "Quota exceeded" } }));
    await expect(requestGemini(KEY, { body: {} })).rejects.toMatchObject({ code: "GEMINI_QUOTA_EXHAUSTED" });
    expect(fetchSpy).toHaveBeenCalledTimes(GEMINI_MODELS.length);
  });

  it("still retries a transient 503 once per model (control: only quota answers changed)", async () => {
    vi.useFakeTimers();
    fetchSpy.mockImplementation(answer(503, { error: { code: 503, status: "UNAVAILABLE", message: "busy" } }));
    const run = requestGemini(KEY, { body: {} }).catch((error: unknown) => error);
    await vi.runAllTimersAsync();
    expect(await run).toMatchObject({ code: "GEMINI_PROVIDER_UNAVAILABLE" });
    expect(fetchSpy).toHaveBeenCalledTimes(GEMINI_MODELS.length * 2);
  });
});
