/**
 * Agent tests — the agentic loop + SSE streaming.
 *
 * NOTE: agent.ts does NOT import @google/genai — it calls the Gemini REST API
 * via global fetch(). So we mock globalThis.fetch (not an SDK module).
 *
 * Mocked:
 *   - @/lib/secrets        → control whether a Gemini key is present
 *   - @/lib/db             → dummy (tools are mocked; ctx.db is never used)
 *   - ./tools/registry     → control getTool / getAllToolDefinitions
 *   - ./tools/*-tools      → no-op the side-effecting registrations
 *   - globalThis.fetch     → control Gemini API responses (generateContent + streamGenerateContent)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// ── Module mocks (hoisted by vitest) ─────────────────────────────────────────

vi.mock("@/lib/secrets", () => ({
  getSecret: vi.fn<(key: string) => Promise<string | null>>().mockResolvedValue(null),
}));

vi.mock("@/lib/db", () => ({
  db: {},
}));

vi.mock("../tools/registry", () => ({
  getAllToolDefinitions: vi.fn<() => unknown[]>().mockReturnValue([]),
  getTool: vi.fn<(name: string) => unknown>().mockReturnValue(undefined),
  registerTool: vi.fn(),
  listTools: vi.fn().mockReturnValue([]),
}));

vi.mock("../tools/core-tools", () => ({}));
vi.mock("../tools/extended-tools", () => ({}));
vi.mock("../tools/advanced-tools", () => ({}));

// ── Imports (after mocks are registered) ─────────────────────────────────────

import { runAgent, runAgentStream, type AgentMessage, type AgentStreamEvent } from "../agent";
import { getSecret } from "@/lib/secrets";
import { getTool } from "../tools/registry";
import type { ChatTool } from "../tools/registry";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build a non-streaming Gemini generateContent JSON Response. */
function geminiJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Build a Gemini text-only response (candidates[0].content.parts[0].text). */
function geminiTextResponse(text: string, status = 200): Response {
  return geminiJsonResponse(
    { candidates: [{ content: { parts: [{ text }] } }] },
    status,
  );
}

/** Build a Gemini function-call response. */
function geminiFunctionCallResponse(name: string, args: Record<string, unknown>): Response {
  return geminiJsonResponse({
    candidates: [{ content: { parts: [{ functionCall: { name, args } }] } }],
  });
}

/** Build a Gemini error response (top-level error field). */
function geminiErrorResponse(status: number, message: string): Response {
  return geminiJsonResponse({ error: { message } }, status);
}

/** Build an SSE streaming Response from an array of Gemini chunk objects. */
function sseResponse(chunks: object[], status = 200): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(c)}\n\n`));
      }
      controller.close();
    },
  });
  return new Response(body, { status, headers: { "Content-Type": "text/event-stream" } });
}

/** Collect all events from the streaming agent into an array. */
async function collectStream(
  history: AgentMessage[],
  message: string,
): Promise<AgentStreamEvent[]> {
  const events: AgentStreamEvent[] = [];
  for await (const ev of runAgentStream(history, message)) {
    events.push(ev);
  }
  return events;
}

/** Narrow a streamed event to a specific variant (throws if not found/mismatched). */
function expectEvent<T extends AgentStreamEvent["type"]>(
  events: AgentStreamEvent[],
  type: T,
): Extract<AgentStreamEvent, { type: T }> {
  const ev = events.find((e) => e.type === type);
  if (!ev || ev.type !== type) {
    throw new Error(`expected event "${type}", got: ${JSON.stringify(events.map((e) => e.type))}`);
  }
  return ev as Extract<AgentStreamEvent, { type: T }>;
}

/** Build a mock ChatTool with a `type: "object"` literal parameter schema. */
function mockTool(name: string, execute: ReturnType<typeof vi.fn>): ChatTool {
  return {
    definition: {
      name,
      description: "",
      parameters: { type: "object" as const, properties: {} },
    },
    execute: execute as ChatTool["execute"],
  };
}

// ── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Default: no Gemini key. Individual tests override with mockResolvedValue.
  vi.mocked(getSecret).mockResolvedValue(null);
  vi.mocked(getTool).mockReturnValue(undefined);
  // Default fetch: should not be called. Tests install their own implementation.
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// ── runAgent — non-streaming ─────────────────────────────────────────────────

describe("runAgent — no API key", () => {
  it("returns a helpful French message when no Gemini key is configured", async () => {
    const result = await runAgent([], "Bonjour");

    expect(result.response).toMatch(/clé Gemini/i);
    expect(result.response).toMatch(/Paramètres/i);
    expect(result.toolCalls).toEqual([]);
    expect(getSecret).toHaveBeenCalledWith("gemini_api_key");
    // Must NOT have called Gemini
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("runAgent — text response", () => {
  it("returns Gemini's text response directly (no tool calls)", async () => {
    vi.mocked(getSecret).mockResolvedValue("test-key");
    vi.mocked(fetch).mockResolvedValue(geminiTextResponse("Bonjour, comment puis-je aider?"));

    const result = await runAgent([], "Salut");

    expect(result.response).toBe("Bonjour, comment puis-je aider?");
    expect(result.toolCalls).toEqual([]);
    expect(result.error).toBeUndefined();
    // fetch called once (first model succeeds)
    expect(fetch).toHaveBeenCalledTimes(1);
    // API key sent via header, not URL
    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    expect((init as RequestInit).headers).toMatchObject({ "x-goog-api-key": "test-key" });
  });
});

describe("runAgent — tool calls", () => {
  it("executes a tool call and feeds the result back to Gemini", async () => {
    vi.mocked(getSecret).mockResolvedValue("test-key");

    const execute = vi.fn().mockResolvedValue({
      success: true,
      data: [{ id: "p1", name: "iPhone 14", price: 85000 }],
    });
    vi.mocked(getTool).mockReturnValue(mockTool("search_products", execute));

    // First call: Gemini requests a tool call. Second call: Gemini returns text.
    vi.mocked(fetch)
      .mockResolvedValueOnce(geminiFunctionCallResponse("search_products", { query: "iPhone" }))
      .mockResolvedValueOnce(geminiTextResponse("J'ai trouvé 1 produit: iPhone 14 à 85000 DA."));

    const result = await runAgent([], "Cherche un iPhone");

    expect(result.response).toBe("J'ai trouvé 1 produit: iPhone 14 à 85000 DA.");
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]!.name).toBe("search_products");
    expect(result.toolCalls[0]!.args).toEqual({ query: "iPhone" });
    expect(result.toolCalls[0]!.result).toEqual([{ id: "p1", name: "iPhone 14", price: 85000 }]);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("handles a failed tool execution by feeding the error back", async () => {
    vi.mocked(getSecret).mockResolvedValue("test-key");

    const execute = vi.fn().mockResolvedValue({ success: false, error: "Client introuvable" });
    vi.mocked(getTool).mockReturnValue(mockTool("create_order", execute));

    vi.mocked(fetch)
      .mockResolvedValueOnce(geminiFunctionCallResponse("create_order", { customerId: "x" }))
      .mockResolvedValueOnce(geminiTextResponse("Je n'ai pas pu créer la commande: client introuvable."));

    const result = await runAgent([], "Crée une commande");

    expect(result.response).toMatch(/client introuvable/i);
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]!.result).toEqual({ error: "Client introuvable" });
  });

  it("handles an unknown tool name gracefully", async () => {
    vi.mocked(getSecret).mockResolvedValue("test-key");
    vi.mocked(getTool).mockReturnValue(undefined); // tool not found

    vi.mocked(fetch)
      .mockResolvedValueOnce(geminiFunctionCallResponse("nonexistent_tool", {}))
      .mockResolvedValueOnce(geminiTextResponse("Désolé, cet outil n'existe pas."));

    const result = await runAgent([], "Fais quelque chose");

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]!.result).toEqual({ error: "Outil inconnu: nonexistent_tool" });
    expect(result.response).toBe("Désolé, cet outil n'existe pas.");
  });
});

describe("runAgent — error handling", () => {
  it("returns an error on a 500 Gemini response", async () => {
    vi.mocked(getSecret).mockResolvedValue("test-key");
    // All 3 models return 500
    vi.mocked(fetch).mockResolvedValue(geminiErrorResponse(500, "Internal error"));

    const result = await runAgent([], "Salut");

    expect(result.error).toMatch(/Internal error/);
    expect(result.response).toBe("");
  });

  it("returns a 'cannot contact' error when all models throw network errors", async () => {
    vi.mocked(getSecret).mockResolvedValue("test-key");
    vi.mocked(fetch).mockRejectedValue(new Error("network failure"));

    const result = await runAgent([], "Salut");

    expect(result.error).toMatch(/Impossible de contacter Gemini/);
    // Tried all 3 models
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("falls through models on 400/404 and returns 'cannot contact' if all fail", async () => {
    vi.mocked(getSecret).mockResolvedValue("test-key");
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 404 }));

    const result = await runAgent([], "Salut");

    expect(result.error).toMatch(/Impossible de contacter Gemini/);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("returns 'could not generate' on an empty response (no text, no function call)", async () => {
    vi.mocked(getSecret).mockResolvedValue("test-key");
    // Empty candidates
    vi.mocked(fetch).mockResolvedValue(geminiJsonResponse({ candidates: [{ content: { parts: [] } }] }));

    const result = await runAgent([], "Salut");

    expect(result.response).toMatch(/Reformulez votre question/);
  });
});

describe("runAgent — iteration limit", () => {
  it("stops after 5 iterations of tool calls and returns the limit message", async () => {
    vi.mocked(getSecret).mockResolvedValue("test-key");

    const execute = vi.fn().mockResolvedValue({ success: true, data: [] });
    vi.mocked(getTool).mockReturnValue(mockTool("search_products", execute));

    // Every fetch returns a function call — never resolves to text.
    // Use mockImplementation (not mockResolvedValue) so each call returns a
    // FRESH Response object — Response bodies can only be consumed once, so
    // reusing the same Response across 5 iterations throws "body already
    // consumed" inside the agent's try/catch, which masks the iteration limit.
    vi.mocked(fetch).mockImplementation(async () =>
      geminiFunctionCallResponse("search_products", {}),
    );

    const result = await runAgent([], "loop");

    expect(result.response).toMatch(/limite d'itérations/i);
    expect(result.toolCalls).toHaveLength(5);
    expect(fetch).toHaveBeenCalledTimes(5);
  });
});

describe("runAgent — transient retry (503 → 200)", () => {
  it("retries on 503 and succeeds on the second attempt", async () => {
    vi.mocked(getSecret).mockResolvedValue("test-key");
    vi.useFakeTimers();

    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(geminiTextResponse("OK after retry"));

    const promise = runAgent([], "hi");
    // Fast-forward the 1s backoff inside fetchGeminiWithRetry
    await vi.advanceTimersByTimeAsync(1000);
    const result = await promise;

    expect(result.response).toBe("OK after retry");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

// ── runAgentStream — streaming ───────────────────────────────────────────────

describe("runAgentStream — no API key", () => {
  it("yields a single done event with the 'no key' message", async () => {
    const events = await collectStream([], "Bonjour");

    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("done");
    expect(expectEvent(events, "done").response).toMatch(/clé Gemini/i);
  });
});

describe("runAgentStream — text streaming", () => {
  it("streams text_delta events then a done event", async () => {
    vi.mocked(getSecret).mockResolvedValue("test-key");
    vi.mocked(fetch).mockResolvedValue(
      sseResponse([
        { candidates: [{ content: { parts: [{ text: "Hello " }] } }] },
        { candidates: [{ content: { parts: [{ text: "world!" }] } }] },
      ]),
    );

    const events = await collectStream([], "Salut");

    const types = events.map((e) => e.type);
    expect(types).toEqual(["text_delta", "text_delta", "done"]);
    const deltas = events.filter((e) => e.type === "text_delta") as Extract<AgentStreamEvent, { type: "text_delta" }>[];
    expect(deltas[0]!.text).toBe("Hello ");
    expect(deltas[1]!.text).toBe("world!");
    expect(expectEvent(events, "done").response).toBe("Hello world!");
  });
});

describe("runAgentStream — tool calls", () => {
  it("yields tool_call + tool_result then text_delta + done", async () => {
    vi.mocked(getSecret).mockResolvedValue("test-key");

    const execute = vi.fn().mockResolvedValue({ success: true, data: { totalOrders: 42 } });
    vi.mocked(getTool).mockReturnValue(mockTool("get_stats", execute));

    // First stream: a function call. Second stream: text.
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        sseResponse([{ candidates: [{ content: { parts: [{ functionCall: { name: "get_stats", args: {} } }] } }] }]),
      )
      .mockResolvedValueOnce(
        sseResponse([{ candidates: [{ content: { parts: [{ text: "Vous avez 42 commandes." }] } }] }]),
      );

    const events = await collectStream([], "Stats?");
    const types = events.map((e) => e.type);

    expect(types).toEqual(["tool_call", "tool_result", "text_delta", "done"]);
    expect(expectEvent(events, "tool_call").name).toBe("get_stats");
    expect(expectEvent(events, "tool_result").result).toEqual({ totalOrders: 42 });
    const done = expectEvent(events, "done");
    expect(done.response).toBe("Vous avez 42 commandes.");
    expect(done.toolCalls).toHaveLength(1);
    expect(execute).toHaveBeenCalledTimes(1);
  });
});

describe("runAgentStream — error events", () => {
  it("yields an error event when all models fail to connect", async () => {
    vi.mocked(getSecret).mockResolvedValue("test-key");
    vi.mocked(fetch).mockRejectedValue(new Error("network down"));

    const events = await collectStream([], "Salut");

    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("error");
    expect(expectEvent(events, "error").message).toMatch(/Impossible de contacter Gemini/);
  });

  it("yields an error event on a non-ok HTTP status", async () => {
    vi.mocked(getSecret).mockResolvedValue("test-key");
    // 500 on all models. Use mockImplementation (not mockResolvedValue) so each
    // call returns a FRESH Response — the agent calls res.json() on each model
    // attempt, and a Response body can only be consumed once.
    vi.mocked(fetch).mockImplementation(async () =>
      geminiErrorResponse(500, "Server boom"),
    );

    const events = await collectStream([], "Salut");

    const types = events.map((e) => e.type);
    expect(types).toContain("error");
    expect(expectEvent(events, "error").message).toMatch(/Server boom/);
  });
});

describe("runAgentStream — empty response", () => {
  it("yields a done event with the 'could not generate' message when no parts arrive", async () => {
    vi.mocked(getSecret).mockResolvedValue("test-key");
    // Stream with a chunk that has empty parts
    vi.mocked(fetch).mockResolvedValue(
      sseResponse([{ candidates: [{ content: { parts: [] } }] }]),
    );

    const events = await collectStream([], "Salut");

    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("done");
    expect(expectEvent(events, "done").response).toMatch(/Reformulez votre question/);
  });
});
