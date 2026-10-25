/** Responses request pins, SSE parsing, error mapping, retry rules, scrubbing. fetch is always mocked. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const loggerMock = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: loggerMock }));

import {
  OPENAI_UNSUPPORTED_RESPONSE_FIELDS, listOpenAiModels, requestOpenAiResponses, assertResponsesBodyAllowed,
} from "../responses";
import { OPENAI_ERROR_CODES, OPENAI_USAGE_URL, OpenAiProviderError, openAiErrorMessage, scrubOpenAiSecrets, shouldRerunOAuth } from "../errors";

const JWT = "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEifQ.c2lnbmF0dXJlc2lnbmF0dXJl";
const TOKEN = "AT-access-token-value-1234";
const sse = (events: Array<[string, unknown]>) => events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join("");
const sseRes = (events: Array<[string, unknown]>, headers: Record<string, string> = {}) =>
  new Response(sse(events), { status: 200, headers: { "Content-Type": "text/event-stream", ...headers } });
const completed = (output: unknown[], usage: unknown = { input_tokens: 5, output_tokens: 2, total_tokens: 7 }) =>
  [["response.completed", { type: "response.completed", response: { id: "resp_1", model: "m1", output, usage } }]] as Array<[string, unknown]>;
const textMsg = (text: string) => ({ type: "message", role: "assistant", content: [{ type: "output_text", text }] });
const errJson = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
const REQ = { accessToken: TOKEN, model: "m1", instructions: "Be brief.", input: [{ role: "user", content: "Hi" }] };
const deps = (f: unknown) => ({ fetch: f as typeof fetch, sleep: async () => {}, timeoutMs: 1000 });
beforeEach(() => { Object.values(loggerMock).forEach((m) => m.mockReset()); });

describe("request pins", () => {
  it("sends store:false, stream:true, array input, instructions, bearer, and no unsupported field", async () => {
    const f = vi.fn().mockResolvedValue(sseRes(completed([textMsg("ok")])));
    await requestOpenAiResponses({ ...REQ, tools: [{ type: "function", name: "lookup", parameters: { type: "object" } }] }, deps(f));
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ model: "m1", store: false, stream: true, instructions: "Be brief." });
    expect(Array.isArray(body.input)).toBe(true);
    expect(body.input.some((i: { role?: string }) => i.role === "system")).toBe(false);
    for (const field of OPENAI_UNSUPPORTED_RESPONSE_FIELDS) expect(body).not.toHaveProperty(field);
    expect(body).not.toHaveProperty("previous_response_id");
  });
  it("pins the documented unsupported-field list and fails if a body carries one", () => {
    expect([...OPENAI_UNSUPPORTED_RESPONSE_FIELDS].sort()).toEqual([
      "background", "conversation", "max_output_tokens", "max_tool_calls", "metadata", "moderation", "multi_agent",
      "prompt", "prompt_cache_retention", "safety_identifier", "temperature", "top_logprobs", "top_p", "truncation", "user",
    ]);
    for (const field of [...OPENAI_UNSUPPORTED_RESPONSE_FIELDS, "previous_response_id"]) {
      expect(() => assertResponsesBodyAllowed({ model: "m", [field]: 1 })).toThrow(OpenAiProviderError);
    }
    expect(() => assertResponsesBodyAllowed({ model: "m", store: false, stream: true })).not.toThrow();
  });
  it("refuses a system item or an unsupported tool before any network call", async () => {
    const f = vi.fn();
    const sys = await requestOpenAiResponses({ ...REQ, input: [{ type: "message", role: "system", content: "x" }] }, deps(f)).catch((e) => e);
    const tool = await requestOpenAiResponses({ ...REQ, tools: [{ type: "image_generation" }] }, deps(f)).catch((e) => e);
    expect([sys.code, tool.code]).toEqual(["OPENAI_REQUEST_INVALID", "OPENAI_REQUEST_INVALID"]);
    expect(f).not.toHaveBeenCalled();
  });
});

describe("SSE parsing", () => {
  it("returns the text, usage and ids of a completed answer, even in small chunks", async () => {
    const text = sse([["response.created", { type: "response.created" }], ["response.output_text.delta", { delta: "Hel" }], ["response.output_text.delta", { delta: "lo" }], ...completed([textMsg("Hello")])]);
    const bytes = new TextEncoder().encode(text);
    const stream = new ReadableStream({ start(c) { for (let i = 0; i < bytes.length; i += 7) c.enqueue(bytes.slice(i, i + 7)); c.close(); } });
    const f = vi.fn().mockResolvedValue(new Response(stream, { status: 200, headers: { "x-request-id": "req_9" } }));
    const out = await requestOpenAiResponses(REQ, deps(f));
    expect(out).toMatchObject({ text: "Hello", functionCalls: [], model: "m1", responseId: "resp_1", requestId: "req_9", usage: { input_tokens: 5, output_tokens: 2, total_tokens: 7 } });
  });
  it("returns function calls", async () => {
    const call = { type: "function_call", call_id: "call_1", name: "lookup", arguments: '{"a":1}' };
    const f = vi.fn().mockResolvedValue(sseRes([["response.output_item.done", { item: call }], ...completed([call])]));
    const out = await requestOpenAiResponses(REQ, deps(f));
    expect(out.functionCalls).toEqual([{ callId: "call_1", name: "lookup", arguments: '{"a":1}' }]);
    expect(out.text).toBe("");
  });
  it("falls back to the deltas when the completed event has no output items", async () => {
    const f = vi.fn().mockResolvedValue(sseRes([["response.output_text.delta", { delta: "Hi" }], ...completed([])]));
    expect((await requestOpenAiResponses(REQ, deps(f))).text).toBe("Hi");
  });
  it("a usage limit that arrives as response.failed after the stream began is a quota error", async () => {
    const f = vi.fn().mockResolvedValue(sseRes([["response.output_text.delta", { delta: "Hi" }], ["response.failed", { response: { error: { code: "subscription_sharing_usage_limit_exceeded", message: "limit" } } }]]));
    await expect(requestOpenAiResponses(REQ, deps(f))).rejects.toMatchObject({ code: "OPENAI_QUOTA_EXHAUSTED" });
  });
  it("response.incomplete and a stream that ends early are errors, not answers", async () => {
    const inc = vi.fn().mockResolvedValue(sseRes([["response.incomplete", { response: { incomplete_details: { reason: "max_tokens" } } }]]));
    await expect(requestOpenAiResponses(REQ, deps(inc))).rejects.toBeInstanceOf(OpenAiProviderError);
    const cut = vi.fn().mockResolvedValue(sseRes([["response.output_text.delta", { delta: "Hi" }]]));
    await expect(requestOpenAiResponses(REQ, deps(cut))).rejects.toMatchObject({ code: "OPENAI_NETWORK_ERROR" });
    expect(cut).toHaveBeenCalledTimes(1);
  });
});

describe("error mapping and retries", () => {
  const cases: Array<[number, unknown, Record<string, string>, string]> = [
    [401, { detail: "no" }, {}, "OPENAI_TOKEN_EXPIRED"],
    [403, { detail: "region" }, {}, "OPENAI_ADMISSION_FAILED"],
    [403, { error: { code: "subscription_sharing_user_not_eligible" } }, {}, "OPENAI_PLAN_NOT_ELIGIBLE"],
    [403, { error: { code: "subscription_sharing_route_not_supported" } }, {}, "OPENAI_ADMISSION_FAILED"],
    [403, { error: { code: "chatpass_v2_scope_not_authorized" } }, {}, "OPENAI_ADMISSION_FAILED"],
    [403, { error: { code: "chatpass_v2_invalid_authorization_context" } }, {}, "OPENAI_ADMISSION_FAILED"],
    [401, { error: { code: "subscription_sharing_invalid_user" } }, {}, "OPENAI_TOKEN_EXPIRED"],
    [429, { error: { code: "subscription_sharing_usage_limit_exceeded" } }, { "retry-after": "120" }, "OPENAI_QUOTA_EXHAUSTED"],
    [400, { error: { code: "subscription_sharing_unsupported_capability", param: "temperature" } }, {}, "OPENAI_REQUEST_INVALID"],
    [404, { error: { code: "model_not_found" } }, {}, "OPENAI_MODEL_UNAVAILABLE"],
    [400, { error: { message: "bad" } }, {}, "OPENAI_REQUEST_INVALID"],
    [503, { error: { code: "subscription_sharing_usage_unavailable" } }, {}, "OPENAI_PROVIDER_UNAVAILABLE"],
    [503, { error: { code: "subscription_sharing_user_unavailable" } }, {}, "OPENAI_PROVIDER_UNAVAILABLE"],
    [500, { detail: "boom" }, {}, "OPENAI_PROVIDER_UNAVAILABLE"],
  ];
  it.each(cases)("HTTP %i %j -> %s", async (status, body, headers, code) => {
    const f = vi.fn().mockImplementation(async () => errJson(status, body, { "x-request-id": "req_1", ...headers }));
    const err = await requestOpenAiResponses(REQ, deps(f)).catch((e) => e);
    expect(err).toBeInstanceOf(OpenAiProviderError);
    expect(err).toMatchObject({ code, status, requestId: "req_1" });
  });
  it("429 without a delay carries null; 429, 401 and 403 are never retried", async () => {
    for (const status of [429, 401, 403]) {
      const f = vi.fn().mockImplementation(async () => errJson(status, { detail: "x" }));
      const err = await requestOpenAiResponses(REQ, deps(f)).catch((e) => e);
      expect(f).toHaveBeenCalledTimes(1);
      if (status === 429) expect(err.retryAfterSeconds).toBeNull();
    }
  });
  it("retries a network error once, then reports it", async () => {
    const ok = vi.fn().mockRejectedValueOnce(new TypeError("fetch failed")).mockResolvedValueOnce(sseRes(completed([textMsg("ok")])));
    expect((await requestOpenAiResponses(REQ, deps(ok))).text).toBe("ok");
    expect(ok).toHaveBeenCalledTimes(2);
    const bad = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    await expect(requestOpenAiResponses(REQ, deps(bad))).rejects.toMatchObject({ code: "OPENAI_NETWORK_ERROR" });
    expect(bad).toHaveBeenCalledTimes(2);
    const five = vi.fn().mockImplementation(async () => errJson(503, { detail: "x" }));
    await expect(requestOpenAiResponses(REQ, deps(five))).rejects.toMatchObject({ code: "OPENAI_PROVIDER_UNAVAILABLE" });
    expect(five).toHaveBeenCalledTimes(2);
  });
  it("times out a stream that never answers", async () => {
    vi.useFakeTimers();
    try {
      const hang = vi.fn((_u: string, init: RequestInit) => new Promise((_r, reject) => {
        init.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
      }));
      const p = requestOpenAiResponses(REQ, { fetch: hang as unknown as typeof fetch, sleep: async () => {}, timeoutMs: 500 }).catch((e) => e);
      await vi.advanceTimersByTimeAsync(2000);
      expect((await p).code).toBe("OPENAI_TIMEOUT");
    } finally { vi.useRealTimers(); }
  });
});

describe("plan eligibility and the plan usage limit", () => {
  const notEligible = { error: { code: "subscription_sharing_user_not_eligible", message: "not eligible" } };
  const limit = { error: { code: "subscription_sharing_usage_limit_exceeded", message: "limit" } };
  it("a plan that cannot be used has its own code, is tried once, and never sends the user through OAuth again", async () => {
    const f = vi.fn().mockImplementation(async () => errJson(403, notEligible, { "x-request-id": "req_7" }));
    const err = await requestOpenAiResponses(REQ, deps(f)).catch((e) => e);
    expect(f).toHaveBeenCalledTimes(1);
    expect(err).toMatchObject({ code: "OPENAI_PLAN_NOT_ELIGIBLE", status: 403, requestId: "req_7" });
    expect(shouldRerunOAuth(err)).toBe(false);
    expect(shouldRerunOAuth(new OpenAiProviderError("OPENAI_SESSION_REVOKED", "x"))).toBe(true);
    for (const locale of ["fr", "ar", "en"] as const) expect(openAiErrorMessage(err, locale)).toContain("Groq");
    expect(openAiErrorMessage(err, "en")).toMatch(/plan cannot be used by this app/i);
  });
  it("the same answer inside a stream (response.failed) maps the same way", async () => {
    const f = vi.fn().mockResolvedValue(sseRes([["response.failed", { response: { error: notEligible.error } }]]));
    await expect(requestOpenAiResponses(REQ, deps(f))).rejects.toMatchObject({ code: "OPENAI_PLAN_NOT_ELIGIBLE" });
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("the plan usage limit is a quota error with no invented reset time and a link to ChatGPT usage", async () => {
    const f = vi.fn().mockImplementation(async () => errJson(429, limit, { "retry-after": "120" }));
    const err = await requestOpenAiResponses(REQ, deps(f)).catch((e) => e);
    expect(f).toHaveBeenCalledTimes(1);
    expect(err.code).toBe("OPENAI_QUOTA_EXHAUSTED");
    expect(err.retryAfterSeconds ?? null).toBeNull();
    expect(err.usageLinkHint).toBe("https://chatgpt.com/settings/usage");
    expect(OPENAI_USAGE_URL).toBe("https://chatgpt.com/settings/usage");
    expect(openAiErrorMessage(err, "en")).not.toMatch(/reset/i);
    const inStream = vi.fn().mockResolvedValue(sseRes([["response.failed", { response: { error: limit.error } }]]));
    const late = await requestOpenAiResponses(REQ, deps(inStream)).catch((e) => e);
    expect(late).toMatchObject({ code: "OPENAI_QUOTA_EXHAUSTED", usageLinkHint: OPENAI_USAGE_URL });
    expect(late.retryAfterSeconds ?? null).toBeNull();
  });
  it("a plain 429 that names no OpenAI code still carries its retry-after delay", async () => {
    const f = vi.fn().mockImplementation(async () => errJson(429, { error: { message: "slow down" } }, { "retry-after": "120" }));
    expect((await requestOpenAiResponses(REQ, deps(f)).catch((e) => e)).retryAfterSeconds).toBe(120);
  });
});

describe("secrets never reach errors or logs", () => {
  it("scrubs JWTs, bearer values, token fields and known secrets", () => {
    const text = `Bearer ${TOKEN} jwt ${JWT} {"refresh_token":"rt-abcdef123456"} id_token_hint=${JWT} code_verifier=verifier123 known-secret-xyz`;
    const out = scrubOpenAiSecrets(text, "known-secret-xyz");
    expect(out).not.toMatch(/eyJ|AT-access|rt-abcdef|verifier123|known-secret/);
  });
  it("an upstream message that echoes a token is scrubbed in the error and in the logs", async () => {
    const f = vi.fn().mockImplementation(async () => errJson(400, { error: { message: `bad token ${JWT} for Bearer ${TOKEN}` } }));
    const err = await requestOpenAiResponses(REQ, deps(f)).catch((e) => e);
    expect(err.message).not.toMatch(/eyJ|AT-access/);
    expect(JSON.stringify(loggerMock.warn.mock.calls) + JSON.stringify(loggerMock.error.mock.calls)).not.toMatch(/eyJ|AT-access/);
  });
});

describe("error codes and messages", () => {
  it("only the quota code ends with _QUOTA_EXHAUSTED, and every code has fr/ar/en words", () => {
    expect(OPENAI_ERROR_CODES.filter((c) => c.endsWith("_QUOTA_EXHAUSTED"))).toEqual(["OPENAI_QUOTA_EXHAUSTED"]);
    for (const code of OPENAI_ERROR_CODES) {
      const msgs = (["fr", "ar", "en"] as const).map((l) => openAiErrorMessage(new OpenAiProviderError(code, "x"), l));
      expect(new Set(msgs).size).toBe(3);
      msgs.forEach((m) => expect(m.length).toBeGreaterThan(10));
    }
    expect(openAiErrorMessage(new OpenAiProviderError("OPENAI_SESSION_REVOKED", "x"), "en")).toMatch(/sign in with ChatGPT again/i);
    expect(openAiErrorMessage(new OpenAiProviderError("OPENAI_QUOTA_EXHAUSTED", "x", { retryAfterSeconds: 600 }), "en")).toMatch(/10 min/);
  });
});

describe("model list", () => {
  it("keeps visibility=list models in the server's order", async () => {
    const f = vi.fn().mockResolvedValue(errJson(200, { models: [{ slug: "a", display_name: "A", visibility: "list" }, { slug: "h", display_name: "H", visibility: "hide" }, { slug: "b", display_name: "B", visibility: "list" }] }));
    expect(await listOpenAiModels(TOKEN, deps(f))).toEqual([{ slug: "a", displayName: "A" }, { slug: "b", displayName: "B" }]);
    expect(f.mock.calls[0]![0]).toBe("https://api.openai.com/v1/models");
    expect(f.mock.calls[0]![1].headers.Authorization).toBe(`Bearer ${TOKEN}`);
  });
});
