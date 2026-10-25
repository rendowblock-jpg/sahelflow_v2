/** Groq adapter: request shape, error mapping, retry rules, key scrubbing. All fetch calls are mocked. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loggerMock = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: loggerMock }));

import {
  GroqProviderError,
  groqErrorMessage,
  parseGroqDuration,
  requestGroq,
  scrubGroqSecrets,
} from "../provider";
import { DEFAULT_GROQ_MODEL, GROQ_MODELS } from "../catalog";

// Built at runtime so no literal looks like a real credential to a scanner.
const KEY = ["gsk", "_", "FakeFakeFakeFakeFakeFake1234567890"].join("");
const URL = "https://api.groq.com/openai/v1/chat/completions";
const fetchSpy = vi.fn();

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}
const OK_BODY = {
  choices: [{ message: { content: '{"items":[]}' } }],
  usage: { prompt_tokens: 3334, completion_tokens: 40 },
};
const call = (extra: Record<string, unknown> = {}) =>
  requestGroq(KEY, { body: { messages: [] }, retryDelayMs: 0, ...extra });
async function codeOf(promise: Promise<unknown>): Promise<GroqProviderError> {
  try { await promise; } catch (e) { return e as GroqProviderError; }
  throw new Error("expected a GroqProviderError");
}

beforeEach(() => {
  fetchSpy.mockReset();
  for (const fn of Object.values(loggerMock)) fn.mockReset();
  vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => vi.unstubAllGlobals());

describe("catalog", () => {
  it("defaults to the measured free model", () => {
    expect(DEFAULT_GROQ_MODEL).toBe("qwen/qwen3.8-27b");
    expect(GROQ_MODELS).toEqual(["qwen/qwen3.8-27b", "openai/gpt-oss-120b", "openai/gpt-oss-20b"]);
  });
});

describe("requestGroq success", () => {
  it("posts to the chat endpoint with a bearer header and the model, key never in the URL", async () => {
    fetchSpy.mockResolvedValueOnce(json(OK_BODY, 200, {
      "x-ratelimit-limit-requests": "1000",
      "x-ratelimit-remaining-requests": "999",
      "x-ratelimit-remaining-tokens": "4666",
    }));
    const result = await call();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, { headers: Record<string, string>; body: string }];
    expect(url).toBe(URL);
    expect(String(url)).not.toContain(KEY);
    expect(init.headers.Authorization).toBe(`Bearer ${KEY}`);
    const sent = JSON.parse(init.body);
    expect(sent.model).toBe(DEFAULT_GROQ_MODEL);
    expect(result.model).toBe(DEFAULT_GROQ_MODEL);
    expect(result.data.choices?.[0]?.message?.content).toBe('{"items":[]}');
    expect(result.data.usage?.prompt_tokens).toBe(3334);
    expect(result.rateLimit).toMatchObject({ limitRequests: 1000, remainingRequests: 999, remainingTokens: 4666 });
  });
});

describe("requestGroq error mapping", () => {
  it.each([
    [400, "GROQ_REQUEST_INVALID"],
    [401, "GROQ_KEY_INVALID"],
    [403, "GROQ_PERMISSION_DENIED"],
    [404, "GROQ_MODEL_UNAVAILABLE"],
  ])("maps HTTP %i to %s without retrying", async (status, code) => {
    fetchSpy.mockResolvedValue(json({ error: { message: "nope", type: "x", code: "y" } }, status));
    const error = await codeOf(call());
    expect(error).toBeInstanceOf(GroqProviderError);
    expect(error.code).toBe(code);
    expect(error.status).toBe(status);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("maps 429 to GROQ_QUOTA_EXHAUSTED, reads retry-after, and never retries", async () => {
    fetchSpy.mockResolvedValue(json({ error: { message: "Rate limit reached", type: "tokens", code: "rate_limit_exceeded" } }, 429, { "retry-after": "37" }));
    const error = await codeOf(call());
    expect(error.code).toBe("GROQ_QUOTA_EXHAUSTED");
    expect(error.retryAfterSeconds).toBe(37);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("falls back to the exhausted bucket's reset header when retry-after is missing", async () => {
    fetchSpy.mockResolvedValue(json({ error: { message: "limit" } }, 429, {
      "x-ratelimit-remaining-requests": "0",
      "x-ratelimit-reset-requests": "2m59.56s",
      "x-ratelimit-remaining-tokens": "7000",
      "x-ratelimit-reset-tokens": "7.66s",
    }));
    expect((await codeOf(call())).retryAfterSeconds).toBe(180);
  });

  it("uses the token reset when only tokens are exhausted; null when nothing is known", async () => {
    fetchSpy.mockResolvedValueOnce(json({ error: { message: "limit" } }, 429, {
      "x-ratelimit-remaining-requests": "12",
      "x-ratelimit-reset-requests": "2m59.56s",
      "x-ratelimit-remaining-tokens": "0",
      "x-ratelimit-reset-tokens": "7.66s",
    }));
    expect((await codeOf(call())).retryAfterSeconds).toBe(8);
    fetchSpy.mockResolvedValueOnce(json({ error: { message: "limit" } }, 429));
    expect((await codeOf(call())).retryAfterSeconds).toBeNull();
  });

  it("retries a 503 once and returns the second answer", async () => {
    fetchSpy.mockResolvedValueOnce(json({ error: { message: "busy" } }, 503)).mockResolvedValueOnce(json(OK_BODY));
    const result = await call();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(result.data.choices).toHaveLength(1);
  });

  it("gives up after one retry on a persistent 5xx", async () => {
    fetchSpy.mockResolvedValue(json({ error: { message: "down" } }, 500));
    const error = await codeOf(call());
    expect(error.code).toBe("GROQ_PROVIDER_UNAVAILABLE");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("maps a network failure to GROQ_NETWORK_ERROR after one retry", async () => {
    fetchSpy.mockRejectedValue(new TypeError("fetch failed"));
    const error = await codeOf(call());
    expect(error.code).toBe("GROQ_NETWORK_ERROR");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("maps our own abort to GROQ_TIMEOUT and does not retry", async () => {
    fetchSpy.mockImplementation((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    }));
    const error = await codeOf(call({ timeoutMs: 20 }));
    expect(error.code).toBe("GROQ_TIMEOUT");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("reads a 200 that is not JSON as GROQ_PROVIDER_UNAVAILABLE", async () => {
    fetchSpy.mockResolvedValue(new Response("<html>portal</html>", { status: 200 }));
    expect((await codeOf(call())).code).toBe("GROQ_PROVIDER_UNAVAILABLE");
  });
});

describe("secrets never leak", () => {
  it("scrubs gsk_ shapes and the exact key from text", () => {
    const text = `bad ${KEY} and gsk_${"A".repeat(24)} and custom-token-value-1234`;
    const scrubbed = scrubGroqSecrets(text, "custom-token-value-1234");
    expect(scrubbed).not.toContain(KEY);
    expect(scrubbed).not.toContain("gsk_AAAA");
    expect(scrubbed).not.toContain("custom-token-value-1234");
    expect(scrubbed).toContain("[redacted]");
  });

  it("keeps the key out of error text, status text and logs when the body or the network error echoes it", async () => {
    fetchSpy.mockResolvedValueOnce(json({ error: { message: `Invalid API Key ${KEY}` } }, 401));
    const keyError = await codeOf(call());
    expect(keyError.message).not.toContain(KEY);

    fetchSpy.mockRejectedValue(new TypeError(`Failed to fetch ${URL} with ${KEY}`));
    const netError = await codeOf(call());
    expect(netError.message).not.toContain(KEY);
    expect(JSON.stringify(Object.values(loggerMock).flatMap((fn) => fn.mock.calls))).not.toContain(KEY);
  });
});

describe("parseGroqDuration", () => {
  it.each([
    ["7.66s", 7.66],
    ["2m59.56s", 179.56],
    ["1h2m3s", 3723],
    ["250ms", 0.25],
    ["45", 45],
  ])("parses %s", (text, seconds) => expect(parseGroqDuration(text)).toBeCloseTo(seconds, 2));
  it.each(["", "soon", null, undefined])("returns null for %s", (text) => expect(parseGroqDuration(text as string)).toBeNull());
});

describe("localized copy", () => {
  it("has plain text in fr, ar and en for every code", () => {
    for (const locale of ["fr", "ar", "en"] as const) {
      for (const code of ["GROQ_KEY_INVALID", "GROQ_PERMISSION_DENIED", "GROQ_QUOTA_EXHAUSTED", "GROQ_MODEL_UNAVAILABLE",
        "GROQ_REQUEST_INVALID", "GROQ_TIMEOUT", "GROQ_NETWORK_ERROR", "GROQ_PROVIDER_UNAVAILABLE"] as const) {
        expect(groqErrorMessage(new GroqProviderError(code, "x"), locale).length).toBeGreaterThan(10);
      }
    }
  });
  it("says when the quota resets if it is known", () => {
    const known = groqErrorMessage(new GroqProviderError("GROQ_QUOTA_EXHAUSTED", "x", 429, 600), "en");
    expect(known).toMatch(/free Groq plan/);
    expect(known).toMatch(/10 min/);
    const unknown = groqErrorMessage(new GroqProviderError("GROQ_QUOTA_EXHAUSTED", "x", 429, null), "en");
    expect(unknown).not.toMatch(/\d+ min/);
  });
});
