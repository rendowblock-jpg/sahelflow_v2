/**
 * Free Gemini key (one with a recent quota stop on record): the agent loop is
 * capped at 2 model requests instead of 5, in BOTH loops, and every Gemini
 * request is counted. A quota stop without a reset time from Google must not
 * be remembered as if Google had named a time. All HTTP is mocked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/secrets", () => ({
  getSecret: vi.fn<(_context: unknown, key: string) => Promise<string | null>>().mockResolvedValue("test-key"),
}));
vi.mock("@/lib/db", () => ({
  db: {},
  shopContext: { shopId: "test", registryRevision: 1, databaseFileId: "test.db", migrationSetSha256: "0".repeat(64) },
}));
vi.mock("@/lib/ai/gemini/runtime-preferences", () => ({
  loadGeminiRuntimePreferences: vi.fn(async () => ({ model: "gemini-3.5-flash", thinkingLevel: "MINIMAL" })),
}));
vi.mock("@/lib/ai/providers/quota-evidence", () => ({ readGeminiFreeKeyEvidence: vi.fn(async () => false) }));
vi.mock("../tools/registry", () => ({
  getAllToolDefinitions: vi.fn<() => unknown[]>().mockReturnValue([]),
  getTool: vi.fn<(name: string) => unknown>().mockReturnValue(undefined),
  registerTool: vi.fn(),
  listTools: vi.fn().mockReturnValue([]),
}));
vi.mock("../tools/core-tools", () => ({}));
vi.mock("../tools/extended-tools", () => ({}));
vi.mock("../tools/advanced-tools", () => ({}));

import { readGeminiFreeKeyEvidence } from "@/lib/ai/providers/quota-evidence";
import { quotaLedger } from "@/lib/ai/providers/quota-ledger";
import { ITERATIONS_FREE, runAgent, runAgentStream, type AgentStreamEvent } from "../agent";
import { getTool } from "../tools/registry";

const fetchSpy = vi.fn();
const toolCallPart = { functionCall: { name: "echo_tool", args: {} } };
const jsonCall = () =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [toolCallPart] } }] }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
const sseCall = () =>
  new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ candidates: [{ content: { parts: [toolCallPart] } }] })}\r\n\r\n`));
        controller.close();
      },
    }),
    { status: 200, headers: { "Content-Type": "text/event-stream" } },
  );
const quota429 = (withRetry: boolean) => () =>
  new Response(
    JSON.stringify({ error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "Quota exceeded",
      ...(withRetry ? { details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "3600s" }] } : {}) } }),
    { status: 429, headers: { "Content-Type": "application/json" } },
  );

async function stream(): Promise<AgentStreamEvent[]> {
  const events: AgentStreamEvent[] = [];
  for await (const event of runAgentStream([], "hello", undefined, undefined, "en")) events.push(event);
  return events;
}

beforeEach(() => {
  fetchSpy.mockReset();
  vi.stubGlobal("fetch", fetchSpy);
  vi.mocked(readGeminiFreeKeyEvidence).mockResolvedValue(false);
  quotaLedger.clear("gemini");
  vi.mocked(getTool).mockReturnValue({
    definition: { name: "echo_tool", description: "test tool", parameters: { type: "object", properties: {} } },
    execute: vi.fn(async () => ({ success: true, data: { ok: true } })),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("free-key iteration cap", () => {
  it("is 2", () => expect(ITERATIONS_FREE).toBe(2));

  it("runAgent: a free key stops after 2 model calls and returns the calm limit text with what it has", async () => {
    vi.mocked(readGeminiFreeKeyEvidence).mockResolvedValue(true);
    fetchSpy.mockImplementation(async () => jsonCall());
    const result = await runAgent([], "hello", undefined, "en");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(result.toolCalls).toHaveLength(2);
    expect(result.response).toBe("The agent reached its iteration limit. Simplify the request and try again.");
    expect(result.error).toBeUndefined();
  });

  it("runAgentStream: a free key stops after 2 model calls with the coded limit event", async () => {
    vi.mocked(readGeminiFreeKeyEvidence).mockResolvedValue(true);
    fetchSpy.mockImplementation(async () => sseCall());
    const events = await stream();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(events.filter((e) => e.type === "tool_result")).toHaveLength(2);
    expect(events.at(-1)).toMatchObject({ type: "error", code: "AI_ITERATION_LIMIT" });
  });

  it("any other key keeps 5 model calls in both loops", async () => {
    fetchSpy.mockImplementation(async () => jsonCall());
    await runAgent([], "hello", undefined, "en");
    expect(fetchSpy).toHaveBeenCalledTimes(5);
    fetchSpy.mockReset();
    fetchSpy.mockImplementation(async () => sseCall());
    await stream();
    expect(fetchSpy).toHaveBeenCalledTimes(5);
  });

  it("counts every Gemini request in the shared ledger, once per model call", async () => {
    vi.mocked(readGeminiFreeKeyEvidence).mockResolvedValue(true);
    const spy = vi.spyOn(quotaLedger, "recordRequest");
    fetchSpy.mockImplementation(async () => jsonCall());
    await runAgent([], "hello", undefined, "en");
    fetchSpy.mockImplementation(async () => sseCall());
    await stream();
    expect(spy.mock.calls.filter(([provider]) => provider === "gemini")).toHaveLength(4);
    spy.mockRestore();
  });
});

describe("what a Gemini quota stop remembers", () => {
  it("a stop with Google's retry time keeps that time as known", async () => {
    fetchSpy.mockImplementation(async () => quota429(true)());
    await runAgent([], "hello", undefined, "en");
    const state = quotaLedger.isPaused("gemini");
    expect(state.paused).toBe(true);
    expect(state.retryAtKnown).toBeUndefined();
    expect(((state.until as Date).getTime() - Date.now()) / 1000).toBeGreaterThan(3500);
  });

  it("a stop WITHOUT a retry time is marked as our own back-off, never as a time Google gave", async () => {
    fetchSpy.mockImplementation(async () => quota429(false)());
    await runAgent([], "hello", undefined, "en");
    expect(quotaLedger.isPaused("gemini")).toMatchObject({ paused: true, retryAtKnown: false });
  });
});
