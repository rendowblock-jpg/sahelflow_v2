/**
 * Gemini -> Groq -> calm stop, end to end with no network: Google's and Groq's
 * 429 answers are fixtures (real bodies and headers) pushed through the real
 * Gemini and Groq paths into the shared ledger, and the quota state a notice
 * would read is resolved from that ledger.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/secrets", () => ({ getSecret: vi.fn(async () => "test-gemini-key") }));
vi.mock("@/lib/ai/gemini/runtime-preferences", () => ({
  loadGeminiRuntimePreferences: vi.fn(async () => ({ model: "gemini-3.5-flash", thinkingLevel: "MINIMAL" })),
}));
vi.mock("@/lib/ai/providers/quota-evidence", () => ({ readGeminiFreeKeyEvidence: vi.fn(async () => false) }));

import { DEFAULT_PAUSE_SECONDS, MAX_PAUSE_SECONDS, createQuotaLedger, quotaLedger } from "@/lib/ai/providers/quota-ledger";
import { pausesFromLedger, resolveQuotaState } from "@/lib/ai/providers/quota-state";
import { GroqProviderError } from "@/lib/ai/providers/groq/provider";
import { runAgent } from "../agent";
import { runChatTurn } from "../chat-provider";
import { runGroqAgent } from "../groq-agent";
import type { ToolContext } from "../tools/registry";

const CONTEXT = { db: {}, shop: { shopId: "test" } } as unknown as ToolContext;
const GROQ_KEY = "gsk_" + "A1b2C3d4E5f6G7h8I9j0K1l2M3n4";
const RETRY = (delay: string) => ({ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: delay });
const googleBody = (message: string, details?: object[]) => ({
  error: { code: 429, status: "RESOURCE_EXHAUSTED", message, ...(details ? { details } : {}) },
});
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const groq429 = (headers: Record<string, string>) => () =>
  json(429, { error: { message: "Rate limit reached for model", type: "requests", code: "rate_limit_exceeded" } }, headers);

function route(gemini: () => Response, groq: () => Response) {
  const fetchMock = vi.fn(async (url: unknown) => (String(url).includes("groq") ? groq() : gemini()));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
const secondsLeft = (provider: "gemini" | "groq") => {
  const state = quotaLedger.isPaused(provider);
  return state.paused && state.until ? Math.round((state.until.getTime() - Date.now()) / 1000) : null;
};

beforeEach(() => {
  quotaLedger.clear("gemini");
  quotaLedger.clear("groq");
});
afterEach(() => vi.unstubAllGlobals());

describe("Gemini 429 body -> resume time", () => {
  const cases: Array<[string, Response | (() => Response), number, boolean]> = [
    ["per-day free tier with a long RetryInfo", () => json(429, googleBody("Quota exceeded for metric GenerateRequestsPerDayPerProjectPerModel-FreeTier", [RETRY("57173s")])), 57173, true],
    ["per-minute answer that only says 'retry in' in its text", () => json(429, googleBody("Please retry in 12.3s.")), 13, true],
    ["no hint at all: our own 15-minute back-off, flagged as not known", () => json(429, googleBody("Quota exceeded")), DEFAULT_PAUSE_SECONDS, false],
    ["garbled retryDelay: same back-off, flagged", () => json(429, googleBody("Quota exceeded", [RETRY("soon")])), DEFAULT_PAUSE_SECONDS, false],
    ["absurd delay is capped at 24 h", () => json(429, googleBody("Quota exceeded", [RETRY("9999999s")])), MAX_PAUSE_SECONDS, true],
  ];
  it.each(cases)("%s", async (_name, make, seconds, known) => {
    route(make as () => Response, () => json(500, {}));
    await runAgent([], "hello", CONTEXT, "en");
    expect(Math.abs((secondsLeft("gemini") ?? -999) - seconds)).toBeLessThanOrEqual(3);
    expect(quotaLedger.isPaused("gemini").retryAtKnown === false).toBe(!known);
  });
});

describe("Groq 429 header -> resume time", () => {
  const NOW = new Date("2026-10-31T10:00:00.000Z");
  const cases: Array<[string, Record<string, string>, number, boolean]> = [
    ["retry-after in seconds", { "retry-after": "42" }, 42, true],
    ["no hint: 15-minute back-off, flagged", {}, DEFAULT_PAUSE_SECONDS, false],
    ["garbled retry-after: same back-off, flagged", { "retry-after": "banana" }, DEFAULT_PAUSE_SECONDS, false],
  ];
  it.each(cases)("%s", async (_name, headers, seconds, known) => {
    const ledger = createQuotaLedger();
    vi.stubGlobal("fetch", vi.fn(async () => groq429(headers)()));
    const result = await runGroqAgent({
      apiKey: GROQ_KEY, history: [], userMessage: "hi", context: CONTEXT, locale: "en",
      deps: { ledger, now: () => NOW },
    });
    expect(result.error?.code).toBe("GROQ_QUOTA_EXHAUSTED");
    const pause = ledger.isPaused("groq", NOW);
    expect(pause.until?.getTime()).toBe(NOW.getTime() + seconds * 1000);
    expect(pause.retryAtKnown === false).toBe(!known);
    expect(GroqProviderError).toBeDefined();
  });
});

describe("the chain", () => {
  const input = {
    history: [], message: "How many orders?", toolContext: CONTEXT, locale: "en" as const,
    order: ["gemini", "groq"], geminiConfigured: true, groqApiKey: GROQ_KEY, images: [],
  };
  const groqAnswers = () => json(200, { choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "Twelve orders." } }], usage: { prompt_tokens: 10, completion_tokens: 3, total_tokens: 13 } });

  it("Gemini 429 -> pause written -> the same question is answered by Groq; the state says so", async () => {
    route(() => json(429, googleBody("Quota exceeded", [RETRY("3600s")])), groqAnswers);
    const result = await runChatTurn(input);
    expect(result.provider).toBe("groq");
    expect(result.response).toBe("Twelve orders.");
    expect(result.error).toBeUndefined();
    expect(secondsLeft("gemini")).toBeGreaterThan(3500);
    const now = new Date();
    expect(resolveQuotaState({ now, providers: ["gemini", "groq"], pauses: pausesFromLedger(quotaLedger, ["gemini", "groq"], now), usedToday: {}, limits: {} }))
      .toEqual({ kind: "ok", answeredBy: "groq", pausedProviders: ["gemini"] });
  });

  it("Groq 429 too -> both paused -> all_paused with the EARLIEST time, and the turn ends with a message, not a throw", async () => {
    route(() => json(429, googleBody("Quota exceeded", [RETRY("3600s")])), groq429({ "retry-after": "42" }));
    const result = await runChatTurn(input);
    expect(result.provider).toBe("groq");
    expect(result.errorCode).toBe("GROQ_QUOTA_EXHAUSTED");
    expect(typeof result.error).toBe("string");
    const now = new Date();
    const state = resolveQuotaState({ now, providers: ["gemini", "groq"], pauses: pausesFromLedger(quotaLedger, ["gemini", "groq"], now), usedToday: {}, limits: {} });
    expect(state.kind).toBe("all_paused");
    if (state.kind === "all_paused") {
      expect(Math.abs((state.resumeAt.getTime() - now.getTime()) / 1000 - 42)).toBeLessThanOrEqual(3);
      expect(state.resumeKnown).toBe(true);
    }
  });
});
