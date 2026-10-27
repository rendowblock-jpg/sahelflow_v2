/**
 * PB-GEMINI-QUOTA, chat path. A Gemini quota answer (HTTP 429 / RESOURCE_EXHAUSTED)
 * inside runAgent / runAgentStream must pause Gemini in the shared quota ledger,
 * exactly as the order reader and the Groq loop already do. Before this, only the
 * order reader recorded it: a paused Gemini was tried again (and failed again) by
 * the next chat message. Real registry; all HTTP is mocked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/secrets", () => ({ getSecret: vi.fn(async () => "test-gemini-key") }));
vi.mock("@/lib/ai/gemini/runtime-preferences", () => ({
  loadGeminiRuntimePreferences: vi.fn(async () => ({ model: "gemini-3.5-flash", thinkingLevel: "MINIMAL" })),
}));

import { DEFAULT_PAUSE_SECONDS, quotaLedger } from "@/lib/ai/providers/quota-ledger";
import { runAgent, runAgentStream, type AgentStreamEvent } from "../agent";
import { runChatTurn } from "../chat-provider";
import type { ToolContext } from "../tools/registry";

const CONTEXT = {
  db: {},
  shop: {
    workspaceId: "a".repeat(32),
    installationId: "b".repeat(32),
    shopId: "test",
    shopIncarnationId: "c".repeat(32),
    registryRevision: 1,
    databaseFileId: "test.db",
    migrationSetSha256: "0".repeat(64),
  },
} as unknown as ToolContext;

const RETRY_INFO = { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "3600s" };
const quotaBody = (withRetry: boolean) => ({
  error: {
    code: 429,
    status: "RESOURCE_EXHAUSTED",
    message: "Quota exceeded for metric GenerateRequestsPerDayPerProjectPerModel-FreeTier",
    ...(withRetry ? { details: [RETRY_INFO] } : {}),
  },
});
const httpJson = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const sse = (chunks: object[]) =>
  new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const c of chunks) controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(c)}\n\n`));
        controller.close();
      },
    }),
    { status: 200, headers: { "content-type": "text/event-stream" } },
  );

/** Every call gets a FRESH Response (a body can only be read once). */
function answerEveryCallWith(make: () => Response) {
  const fetchMock = vi.fn(async () => make());
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function drain(stream: AsyncGenerator<AgentStreamEvent>) {
  const events: AgentStreamEvent[] = [];
  for await (const event of stream) events.push(event);
  return events;
}

/** Seconds from now until Gemini's pause ends; null when it is not paused. */
function pausedForSeconds(): number | null {
  const state = quotaLedger.isPaused("gemini");
  return state.paused && state.until ? (state.until.getTime() - Date.now()) / 1000 : null;
}

beforeEach(() => {
  quotaLedger.clear("gemini");
  quotaLedger.clear("groq");
});
afterEach(() => {
  vi.unstubAllGlobals();
  quotaLedger.clear("gemini");
  quotaLedger.clear("groq");
});

describe("a Gemini quota answer pauses Gemini in the shared ledger", () => {
  it("runAgent: the pause lasts as long as Google said (3600 s)", async () => {
    answerEveryCallWith(() => httpJson(429, quotaBody(true)));
    expect(pausedForSeconds()).toBeNull();
    const result = await runAgent([], "Combien de commandes ?", CONTEXT, "fr");
    expect(result.error).toBeTruthy();
    const seconds = pausedForSeconds();
    expect(seconds).not.toBeNull();
    expect(seconds!).toBeGreaterThan(3590);
    expect(seconds!).toBeLessThanOrEqual(3600);
  });

  it("runAgent: with no delay named, our own 15-minute back-off", async () => {
    answerEveryCallWith(() => httpJson(429, quotaBody(false)));
    await runAgent([], "Combien de commandes ?", CONTEXT, "fr");
    const seconds = pausedForSeconds();
    expect(seconds).not.toBeNull();
    expect(seconds!).toBeGreaterThan(DEFAULT_PAUSE_SECONDS - 10);
    expect(seconds!).toBeLessThanOrEqual(DEFAULT_PAUSE_SECONDS);
  });

  it("runAgentStream: an HTTP 429 before any byte pauses Gemini and ends with one error event", async () => {
    answerEveryCallWith(() => httpJson(429, quotaBody(true)));
    const events = await drain(runAgentStream([], "Combien de commandes ?", undefined, CONTEXT, "fr"));
    expect(events.map((e) => e.type)).toEqual(["error"]);
    const seconds = pausedForSeconds();
    expect(seconds).not.toBeNull();
    expect(seconds!).toBeGreaterThan(3590);
  });

  it("runAgentStream: a quota error INSIDE a started stream pauses Gemini too", async () => {
    answerEveryCallWith(() =>
      sse([{ candidates: [{ content: { parts: [{ text: "Partial" }] } }] }, quotaBody(true)]),
    );
    const events = await drain(runAgentStream([], "Salut", undefined, CONTEXT, "fr"));
    expect(events.map((e) => e.type)).toEqual(["text_delta", "error"]);
    const seconds = pausedForSeconds();
    expect(seconds).not.toBeNull();
    expect(seconds!).toBeGreaterThan(3590);
  });
});

describe("only a quota answer pauses Gemini", () => {
  it.each([
    ["a server fault (500)", 500, { error: { code: 500, status: "INTERNAL", message: "boom" } }],
    ["a refused key (403)", 403, { error: { code: 403, status: "PERMISSION_DENIED", message: "no" } }],
    ["a bad request (400)", 400, { error: { code: 400, status: "INVALID_ARGUMENT", message: "bad" } }],
  ])("%s does not", async (_label, status, body) => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      answerEveryCallWith(() => httpJson(status, body));
      const promise = runAgent([], "Salut", CONTEXT, "fr");
      await vi.runAllTimersAsync();
      const result = await promise;
      expect(result.error).toBeTruthy();
      expect(pausedForSeconds()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("a successful turn does not pause it", async () => {
    answerEveryCallWith(() => httpJson(200, { candidates: [{ content: { parts: [{ text: "Bonjour" }] }, finishReason: "STOP" }] }));
    const result = await runAgent([], "Salut", CONTEXT, "fr");
    expect(result.response).toBe("Bonjour");
    expect(pausedForSeconds()).toBeNull();
  });

  it("a Gemini quota answer never pauses Groq", async () => {
    answerEveryCallWith(() => httpJson(429, quotaBody(true)));
    await runAgent([], "Salut", CONTEXT, "fr");
    expect(quotaLedger.isPaused("groq").paused).toBe(false);
  });
});

describe("the next chat message skips a paused Gemini", () => {
  it("turn 1 hits the quota and falls to Groq; turn 2 never calls Gemini again", async () => {
    const fetchMock = answerEveryCallWith(() => httpJson(429, quotaBody(true)));
    const runGroq = vi.fn(async () => ({
      text: "Réponse de Groq",
      toolCalls: [],
      actionProposals: [],
      stopReason: "final" as const,
    }));
    const input = {
      history: [],
      message: "Combien de commandes ?",
      toolContext: CONTEXT,
      locale: "fr" as const,
      order: ["gemini", "groq"],
      geminiConfigured: true,
      groqApiKey: "gsk_" + "A1b2C3d4E5f6G7h8I9j0K1l2M3n4",
      images: [],
    };

    const first = await runChatTurn(input, { runGroq: runGroq as never });
    expect(first.provider).toBe("groq");
    expect(first.response).toBe("Réponse de Groq");
    const geminiCallsAfterTurn1 = fetchMock.mock.calls.length;
    expect(geminiCallsAfterTurn1).toBeGreaterThan(0);

    const second = await runChatTurn(input, { runGroq: runGroq as never });
    expect(second.provider).toBe("groq");
    expect(fetchMock.mock.calls.length).toBe(geminiCallsAfterTurn1); // Gemini was not asked a second time
    expect(runGroq).toHaveBeenCalledTimes(2);
  });
});
