/** verifyGroqKey: the free "is this key alive" probe (GET /models). Every fetch is mocked; nothing leaves the machine. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loggerMock = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: loggerMock }));

import { verifyGroqKey } from "../provider";
import { DEFAULT_GROQ_MODEL } from "../catalog";

// Built at runtime so no literal looks like a real credential to a scanner.
const KEY = ["gsk", "_", "FakeFakeFakeFakeFakeFake1234567890"].join("");
const URL = "https://api.groq.com/openai/v1/models";
const fetchSpy = vi.fn();

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}
const LISTED = { data: [{ id: "llama-3.1-8b-instant" }, { id: DEFAULT_GROQ_MODEL }] };

beforeEach(() => {
  fetchSpy.mockReset();
  for (const fn of Object.values(loggerMock)) fn.mockReset();
  vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => vi.unstubAllGlobals());

describe("verifyGroqKey: request", () => {
  it("lists models with a GET and the trimmed bearer key, and never asks for a completion", async () => {
    fetchSpy.mockResolvedValue(json(LISTED));
    await verifyGroqKey(`  ${KEY}\n`);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(URL);
    expect(init.method).toBe("GET");
    expect(init.headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(init.body).toBeUndefined();
    expect(String(url)).not.toContain(KEY);
  });

  it("an empty key is refused without any network call", async () => {
    expect(await verifyGroqKey("   ")).toMatchObject({ ok: false, code: "GROQ_KEY_INVALID" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("verifyGroqKey: success", () => {
  it("returns the default model when the account lists it", async () => {
    fetchSpy.mockResolvedValue(json(LISTED));
    expect(await verifyGroqKey(KEY)).toEqual({ ok: true, model: DEFAULT_GROQ_MODEL });
  });

  it("is still ok, without a model, when the default is not listed or the list is unreadable", async () => {
    fetchSpy.mockResolvedValueOnce(json({ data: [{ id: "other" }] }));
    expect(await verifyGroqKey(KEY)).toEqual({ ok: true });
    fetchSpy.mockResolvedValueOnce(new Response("not json", { status: 200 }));
    expect(await verifyGroqKey(KEY)).toEqual({ ok: true });
  });
});

describe("verifyGroqKey: failures use the existing codes, never retry 401/403/429", () => {
  it.each([
    [401, "GROQ_KEY_INVALID"],
    [403, "GROQ_PERMISSION_DENIED"],
    [429, "GROQ_QUOTA_EXHAUSTED"],
    [400, "GROQ_REQUEST_INVALID"],
  ])("HTTP %i -> %s after exactly one call", async (status, code) => {
    fetchSpy.mockResolvedValue(json({ error: { message: `bad ${KEY}` } }, status));
    expect(await verifyGroqKey(KEY)).toMatchObject({ ok: false, code });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("carries Groq's reset time on a 429", async () => {
    fetchSpy.mockResolvedValue(json({}, 429, { "retry-after": "42" }));
    expect(await verifyGroqKey(KEY)).toMatchObject({ ok: false, code: "GROQ_QUOTA_EXHAUSTED", retryAfterSeconds: 42 });
  });

  it("retries a 5xx once, then reports the provider as unavailable", async () => {
    fetchSpy.mockResolvedValue(json({}, 503));
    expect(await verifyGroqKey(KEY, { retryDelayMs: 0 })).toMatchObject({ ok: false, code: "GROQ_PROVIDER_UNAVAILABLE" });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("a network failure is GROQ_NETWORK_ERROR and an abort is GROQ_TIMEOUT", async () => {
    fetchSpy.mockRejectedValueOnce(new Error(`socket closed for ${KEY}`));
    expect(await verifyGroqKey(KEY)).toMatchObject({ ok: false, code: "GROQ_NETWORK_ERROR" });
    const abort = new Error("aborted");
    abort.name = "AbortError";
    fetchSpy.mockRejectedValueOnce(abort);
    expect(await verifyGroqKey(KEY)).toMatchObject({ ok: false, code: "GROQ_TIMEOUT" });
  });

  it("gives the fetch an abort signal for the 10 s timeout", async () => {
    fetchSpy.mockResolvedValue(json(LISTED));
    await verifyGroqKey(KEY);
    expect(fetchSpy.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it("the key is in no result and no log line, even when Groq or the network echoes it", async () => {
    fetchSpy.mockResolvedValueOnce(json({ error: { message: `Invalid API Key ${KEY}` } }, 401));
    fetchSpy.mockRejectedValueOnce(new Error(`boom ${KEY}`));
    const results = [await verifyGroqKey(KEY), await verifyGroqKey(KEY)];
    const everything = JSON.stringify([results, ...Object.values(loggerMock).map((fn) => fn.mock.calls)]);
    expect(everything).not.toContain(KEY);
    expect(everything).not.toContain("FakeFakeFake");
  });
});
