/**
 * Agent tests — the agentic loop + SSE streaming.
 *
 * NOTE: agent.ts calls the Gemini REST API via global fetch().
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@/lib/secrets", () => ({
  getSecret: vi.fn<(_context: unknown, key: string) => Promise<string | null>>().mockResolvedValue(null),
}));

vi.mock("@/lib/db", () => ({
  db: {},
  shopContext: {
    shopId: "test",
    registryRevision: 1,
    databaseFileId: "test.db",
    migrationSetSha256: "0".repeat(64),
  },
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

import { runAgent, runAgentStream, type AgentMessage, type AgentStreamEvent } from "../agent";
import { getSecret } from "@/lib/secrets";
import { getTool } from "../tools/registry";
import type { ChatTool } from "../tools/registry";

function geminiJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function geminiTextResponse(text: string, status = 200): Response {
  return geminiJsonResponse(
    { candidates: [{ content: { parts: [{ text }] } }] },
    status,
  );
}

function geminiFunctionCallResponse(name: string, args: Record<string, unknown>): Response {
  return geminiJsonResponse({
    candidates: [{ content: { parts: [{ functionCall: { name, args } }] } }],
  });
}

function geminiErrorResponse(status: number, message: string): Response {
  return geminiJsonResponse({ error: { message } }, status);
}

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

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSecret).mockResolvedValue(null);
  vi.mocked(getTool).mockReturnValue(undefined);
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("runAgent — no API key", () => {
  it("returns a helpful French message when no Gemini key is configured", async () => {
    const result = await runAgent([], "Bonjour");
    expect(result.response).toMatch(/clé Gemini/i);
    expect(result.response).toMatch(/Paramètres/i);
    expect(result.toolCalls).toEqual([]);
    expect(getSecret).toHaveBeenCalledWith(expect.any(Object), "gemini_api_key");
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
    expect(fetch).toHaveBeenCalledTimes(1);
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

  it("preserves pre-tool text when text + function call arrive together (AI-M8)", async () => {
    vi.mocked(getSecret).mockResolvedValue("test-key");
    const execute = vi.fn().mockResolvedValue({ success: true, data: { totalOrders: 5 } });
    vi.mocked(getTool).mockReturnValue(mockTool("get_stats", execute));
    vi.mocked(fetch)
      .mockResolvedValueOnce(geminiJsonResponse({
        candidates: [{
          content: {
            parts: [
              { text: "Je vais vérifier vos statistiques..." },
              { functionCall: { name: "get_stats", args: {} } },
            ],
          },
        }],
      }))
      .mockResolvedValueOnce(geminiTextResponse("Vous avez 5 commandes au total."));
    const result = await runAgent([], "Combien de commandes ?");
    expect(result.response).toContain("Je vais vérifier vos statistiques...");
    expect(result.response).toContain("Vous avez 5 commandes au total.");
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]!.name).toBe("get_stats");
  });

  it("handles an unknown tool name gracefully", async () => {
    vi.mocked(getSecret).mockResolvedValue("test-key");
    vi.mocked(getTool).mockReturnValue(undefined);
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
  it("returns stable localized copy on a 500 Gemini response", async () => {
    vi.mocked(getSecret).mockResolvedValue("test-key");
    vi.useFakeTimers();
    vi.mocked(fetch).mockImplementation(async () => geminiErrorResponse(500, "Internal error"));
    const promise = runAgent([], "Salut");
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result.error).toMatch(/temporairement indisponible/i);
    expect(result.response).toBe("");
  });

  it("returns stable network copy when the supported models cannot be reached", async () => {
    vi.mocked(getSecret).mockResolvedValue("test-key");
    vi.useFakeTimers();
    vi.mocked(fetch).mockRejectedValue(new Error("network failure"));
    const promise = runAgent([], "Salut");
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result.error).toMatch(/Impossible de joindre Gemini/i);
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("falls through supported models on 404 and returns stable model-unavailable copy", async () => {
    vi.mocked(getSecret).mockResolvedValue("test-key");
    vi.mocked(fetch).mockResolvedValue(
      geminiJsonResponse({ error: { status: "NOT_FOUND", message: "model unavailable" } }, 404),
    );
    const result = await runAgent([], "Salut");
    expect(result.error).toMatch(/Aucun modèle Gemini/i);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("returns 'could not generate' on an empty response", async () => {
    vi.mocked(getSecret).mockResolvedValue("test-key");
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
    await vi.advanceTimersByTimeAsync(1000);
    const result = await promise;
    expect(result.response).toBe("OK after retry");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

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
  it("does not complete a partial response when Gemini emits an SSE error", async () => {
    vi.mocked(getSecret).mockResolvedValue("test-key");
    vi.mocked(fetch).mockResolvedValue(
      sseResponse([
        { candidates: [{ content: { parts: [{ text: "Partial" }] } }] },
        {
          error: {
            code: 429,
            status: "RESOURCE_EXHAUSTED",
            message: "provider prose must not reach the seller",
          },
        },
      ]),
    );

    const events = await collectStream([], "Salut");

    expect(events.map((event) => event.type)).toEqual(["text_delta", "error"]);
    expect(expectEvent(events, "error").message).toMatch(/quota Gemini/i);
    expect(events).not.toContainEqual(expect.objectContaining({ type: "done" }));
  });

  it("yields a stable network error when the supported models cannot connect", async () => {
    vi.mocked(getSecret).mockResolvedValue("test-key");
    vi.useFakeTimers();
    vi.mocked(fetch).mockRejectedValue(new Error("network down"));
    const promise = collectStream([], "Salut");
    await vi.runAllTimersAsync();
    const events = await promise;
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("error");
    expect(expectEvent(events, "error").message).toMatch(/Impossible de joindre Gemini/i);
  });

  it("yields stable localized copy on a non-ok HTTP status", async () => {
    vi.mocked(getSecret).mockResolvedValue("test-key");
    vi.useFakeTimers();
    vi.mocked(fetch).mockImplementation(async () =>
      geminiErrorResponse(500, "Server boom"),
    );
    const promise = collectStream([], "Salut");
    await vi.runAllTimersAsync();
    const events = await promise;
    const types = events.map((e) => e.type);
    expect(types).toContain("error");
    expect(expectEvent(events, "error").message).toMatch(/temporairement indisponible/i);
  });
});

describe("runAgentStream — empty response", () => {
  it("yields a done event with the 'could not generate' message when no parts arrive", async () => {
    vi.mocked(getSecret).mockResolvedValue("test-key");
    vi.mocked(fetch).mockResolvedValue(
      sseResponse([{ candidates: [{ content: { parts: [] } }] }]),
    );
    const events = await collectStream([], "Salut");
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("done");
    expect(expectEvent(events, "done").response).toMatch(/Reformulez votre question/);
  });
});
