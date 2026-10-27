/**
 * Groq turn loop. Every HTTP call is a mocked fetch (nothing leaves the
 * machine); the tools are the REAL registry entries with their bodies spied,
 * so the real `execute` of agent.ts, the real router and the real converters run.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { aiToolRefusalResult } from "../tools/tool-refusal";
import { getTool, type ToolContext } from "../tools/registry";
import { aiProposalRecordedMessage, aiUnknownToolMessage } from "../locale-context";
import { aiChatSystemPromptSlim } from "../neutral/slim-prompt";
import { createQuotaLedger } from "@/lib/ai/providers/quota-ledger";
import { runGroqAgent, GROQ_MAX_STEPS, GROQ_TURN_TOKEN_BUDGET } from "../groq-agent";

const KEY = "gsk_" + "A1b2C3d4E5f6G7h8I9j0K1l2M3n4";
const NOW = new Date("2026-10-26T10:00:00.000Z");
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

const fetchMock = vi.fn();

function completion(message: Record<string, unknown>, usage?: Record<string, number>, finish = "stop"): Response {
  return new Response(JSON.stringify({ choices: [{ message, finish_reason: finish }], ...(usage ? { usage } : {}) }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
const call = (id: string, name: string, args: unknown) => ({
  id,
  type: "function",
  function: { name, arguments: typeof args === "string" ? args : JSON.stringify(args) },
});
const toolStep = (...calls: Array<ReturnType<typeof call>>) =>
  completion({ role: "assistant", content: null, tool_calls: calls }, undefined, "tool_calls");
const answer = (text: string, usage?: Record<string, number>) => completion({ role: "assistant", content: text }, usage);
const errorResponse = (status: number, message: string, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ error: { message } }), { status, headers: { "content-type": "application/json", ...headers } });

// `content` is null on an assistant message that only carries tool calls; the tests only parse tool messages.
type WireMessage = { role: string; content: string; tool_call_id?: string; tool_calls?: Array<{ id: string }> };

function requestBody(index: number): { messages: WireMessage[]; tools?: Array<{ function: { name: string } }> } {
  return JSON.parse(fetchMock.mock.calls[index]?.[1]?.body as string);
}
const offeredNames = (index: number) => (requestBody(index).tools ?? []).map((t) => t.function.name);

function proposalResult() {
  return {
    pending_action_proposal: true as const,
    tool: "update_product_price",
    proposal: {
      id: "aip_test",
      toolName: "update_product_price",
      status: "pending",
      proposalDigestPrefix: "123456789abc",
      summary: { kind: "product_price_update", productId: "product-1", currentPrice: 1000, newPrice: 1200 },
      expiresAt: "2026-10-27T18:00:00.000Z",
      createdAt: "2026-10-26T17:50:00.000Z",
      executionState: null,
      lastErrorCode: null,
    },
    proposalDigest: "1".repeat(64),
  };
}

function run(userMessage: string, extra: Partial<Parameters<typeof runGroqAgent>[0]> = {}, ledger = createQuotaLedger(() => NOW)) {
  return runGroqAgent({
    apiKey: KEY,
    history: [],
    userMessage,
    locale: "fr",
    context: CONTEXT,
    deps: { ledger, now: () => NOW, retryDelayMs: 0 },
    ...extra,
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("runGroqAgent", () => {
  it("answers in one step: slim prompt first, routed tools only, key only in the header", async () => {
    fetchMock.mockResolvedValueOnce(answer("Bonjour !", { prompt_tokens: 1500, completion_tokens: 20, total_tokens: 1520 }));
    const ledger = createQuotaLedger(() => NOW);
    const result = await run("Combien de commandes en attente ?", {
      history: [
        { role: "user", content: "salut" },
        { role: "assistant", content: "Bonjour", toolCalls: [{ name: "get_stats", args: {}, result: { big: "x".repeat(500) } }] },
      ],
      shopContextNote: "Orders awaiting confirmation: 12.",
    }, ledger);

    expect(result.text).toBe("Bonjour !");
    expect(result.steps).toBe(1);
    expect(result.stopReason).toBe("answered");
    expect(result.toolCalls).toEqual([]);
    expect(result.usage).toEqual({ promptTokens: 1500, completionTokens: 20, totalTokens: 1520 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toContain("api.groq.com");
    expect(init.headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(init.body).not.toContain(KEY);
    const body = requestBody(0);
    expect(body.messages[0]?.role).toBe("system");
    expect(body.messages[0]?.content).toContain(aiChatSystemPromptSlim("fr"));
    expect(body.messages[0]?.content).toContain("Orders awaiting confirmation: 12.");
    // history goes as text only; the earlier tool result bytes are not re-sent
    expect(body.messages.slice(1).map((m) => [m.role, m.content])).toEqual([
      ["user", "salut"],
      ["assistant", "Bonjour"],
      ["user", "Combien de commandes en attente ?"],
    ]);
    expect(JSON.stringify(body)).not.toContain("xxxxxxxx");
    expect(offeredNames(0)).toContain("search_orders");
    expect(offeredNames(0)).not.toContain("update_product_price");
    expect(offeredNames(0).length).toBeLessThan(15);
    expect(ledger.requestsToday("groq", NOW)).toBe(1);
  });

  it("runs a step with two tool calls through execute, sends both results back, then answers", async () => {
    const search = vi.spyOn(getTool("search_orders")!, "execute").mockResolvedValue({ success: true, data: [{ orderNumber: "A1", status: "pending", totalPrice: 4500 }] });
    const stats = vi.spyOn(getTool("get_stats")!, "execute").mockResolvedValue({ success: true, data: { pending: 1 } });
    fetchMock
      .mockResolvedValueOnce(toolStep(call("c1", "search_orders", { status: "pending" }), call("c2", "get_stats", {})))
      .mockResolvedValueOnce(answer("Une commande en attente."));
    const ledger = createQuotaLedger(() => NOW);
    const result = await run("Combien de commandes en attente ?", {}, ledger);

    expect(result.text).toBe("Une commande en attente.");
    expect(result.steps).toBe(2);
    expect(search).toHaveBeenCalledWith({ status: "pending" }, CONTEXT);
    expect(stats).toHaveBeenCalledTimes(1);
    expect(result.toolCalls.map((c) => c.name)).toEqual(["search_orders", "get_stats"]);
    expect(result.toolCalls[0]?.result).toEqual([{ orderNumber: "A1", status: "pending", totalPrice: 4500 }]);
    const second = requestBody(1).messages;
    const assistant = second.find((m) => m.role === "assistant")!;
    expect((assistant.tool_calls ?? []).map((c) => c.id)).toEqual(["c1", "c2"]);
    const toolMessages = second.filter((m) => m.role === "tool");
    expect(toolMessages.map((m) => m.tool_call_id)).toEqual(["c1", "c2"]);
    expect(JSON.parse(toolMessages[0]?.content ?? "undefined")[0]).toMatchObject({ orderNumber: "A1", status: "pending" });
    expect(ledger.requestsToday("groq", NOW)).toBe(2);
  });

  it("passes a refusal result from a tool back to the model as written", async () => {
    vi.spyOn(getTool("search_orders")!, "execute").mockResolvedValue({
      success: false,
      error: "x",
      refusal: { code: "AI_TOOL_NOT_PERMITTED" },
    });
    fetchMock
      .mockResolvedValueOnce(toolStep(call("c1", "search_orders", { status: "pending" })))
      .mockResolvedValueOnce(answer("Accès restreint pour votre rôle."));
    const result = await run("Quelles commandes en attente ?");

    expect(result.text).toBe("Accès restreint pour votre rôle.");
    const toolMessage = requestBody(1).messages.find((m) => m.role === "tool")!;
    expect(JSON.parse(toolMessage.content)).toEqual(aiToolRefusalResult({ code: "AI_TOOL_NOT_PERMITTED" }));
    expect(result.toolCalls[0]?.result).toEqual(aiToolRefusalResult({ code: "AI_TOOL_NOT_PERMITTED" }));
  });

  it("ends the turn on an action proposal, without a second model request", async () => {
    const price = vi.spyOn(getTool("update_product_price")!, "execute").mockResolvedValue({ success: true, data: proposalResult() });
    fetchMock.mockResolvedValueOnce(toolStep(call("c1", "update_product_price", { productId: "product-1", price: 1200 })));
    const result = await run("Change le prix du produit à 1200 DA");

    expect(offeredNames(0)).toContain("update_product_price");
    expect(price).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.stopReason).toBe("proposal");
    expect(result.steps).toBe(1);
    expect(result.actionProposals).toHaveLength(1);
    expect(result.actionProposals[0]?.proposal.id).toBe("aip_test");
    expect(result.text).toBe(aiProposalRecordedMessage("fr", "update_product_price"));
  });

  it("answers malformed arguments with an error result and runs nothing", async () => {
    const search = vi.spyOn(getTool("search_orders")!, "execute");
    fetchMock
      .mockResolvedValueOnce(toolStep(call("c1", "search_orders", "{status: pending")))
      .mockResolvedValueOnce(answer("Je réessaie autrement."));
    const result = await run("Quelles commandes en attente ?");

    expect(search).not.toHaveBeenCalled();
    expect(result.toolCalls).toEqual([]);
    expect(result.steps).toBe(2);
    const toolMessage = requestBody(1).messages.find((m) => m.role === "tool")!;
    expect(toolMessage.tool_call_id).toBe("c1");
    expect(JSON.parse(toolMessage.content).error).toMatch(/JSON/);
  });

  it("refuses a tool call whose name was not offered in THIS request, even if it exists in the registry", async () => {
    const price = vi.spyOn(getTool("update_product_price")!, "execute");
    const search = vi.spyOn(getTool("search_orders")!, "execute").mockResolvedValue({ success: true, data: { count: 0 } });
    fetchMock
      .mockResolvedValueOnce(toolStep(call("c1", "update_product_price", { productId: "p", price: 1 }), call("c2", "no_such_tool", {}), call("c3", "search_orders", { status: "pending" })))
      .mockResolvedValueOnce(answer("Je n'ai pas pu modifier le prix."));
    const result = await run("Combien de commandes en attente ?");

    expect(offeredNames(0)).not.toContain("update_product_price");
    expect(price).not.toHaveBeenCalled();
    expect(search).toHaveBeenCalledTimes(1);
    expect(result.steps).toBe(2);
    expect(result.toolCalls.map((c) => c.name)).toEqual(["search_orders"]);
    expect(result.rejectedCalls.map((c) => c.name)).toEqual(["update_product_price", "no_such_tool"]);
    const tools = requestBody(1).messages.filter((m) => m.role === "tool");
    expect(tools.map((m) => m.tool_call_id)).toEqual(["c1", "c2", "c3"]);
    expect(JSON.parse(tools[0]?.content ?? "undefined").error).toContain("update_product_price");
    expect(JSON.parse(tools[1]?.content ?? "undefined")).toEqual({ error: aiUnknownToolMessage("fr", "no_such_tool") });
  });

  it("counts a step made only of refused calls", async () => {
    const price = vi.spyOn(getTool("update_product_price")!, "execute");
    fetchMock.mockImplementation(async () => toolStep(call("c1", "update_product_price", { productId: "p", price: 1 })));
    const result = await run("Combien de commandes en attente ?");
    expect(price).not.toHaveBeenCalled();
    expect(result.steps).toBe(GROQ_MAX_STEPS);
    expect(result.toolCalls).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(GROQ_MAX_STEPS);
  });

  it("returns a typed result on 429, calls fetch once, pauses Groq, and the next turn makes no call", async () => {
    fetchMock.mockResolvedValueOnce(errorResponse(429, `Rate limit reached for key ${KEY}`, { "retry-after": "42" }));
    const ledger = createQuotaLedger(() => NOW);
    const result = await run("Bonjour", {}, ledger);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.stopReason).toBe("error");
    expect(result.text).toBe("");
    expect(result.error).toMatchObject({ code: "GROQ_QUOTA_EXHAUSTED", retryAfterSeconds: 42, paused: false });
    expect(typeof result.error?.message).toBe("string");
    expect(ledger.isPaused("groq", NOW).paused).toBe(true);
    expect(ledger.isPaused("groq", NOW).until?.getTime()).toBe(NOW.getTime() + 42_000);

    const again = await run("Bonjour encore", {}, ledger);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(again.error).toMatchObject({ code: "GROQ_QUOTA_EXHAUSTED", paused: true });
    expect(again.steps).toBe(0);
  });

  it("returns any other Groq error typed and does not pause or retry it", async () => {
    fetchMock.mockResolvedValueOnce(errorResponse(401, "Invalid API Key"));
    const ledger = createQuotaLedger(() => NOW);
    const result = await run("Bonjour", {}, ledger);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.error?.code).toBe("GROQ_KEY_INVALID");
    expect(ledger.isPaused("groq", NOW).paused).toBe(false);
  });

  it("stops after 4 steps when the model keeps calling tools", async () => {
    const search = vi.spyOn(getTool("search_orders")!, "execute").mockResolvedValue({ success: true, data: { count: 0 } });
    fetchMock.mockImplementation(async () => toolStep(call("c1", "search_orders", { status: "pending" })));
    const result = await run("Combien de commandes en attente ?");
    expect(GROQ_MAX_STEPS).toBe(4);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(result.steps).toBe(4);
    expect(result.stopReason).toBe("step_cap");
    expect(search).toHaveBeenCalledTimes(4);
    expect(result.text.length).toBeGreaterThan(0);
  });

  it("stops before the next request when the estimated tokens of the turn would pass 12,000", async () => {
    vi.spyOn(getTool("search_orders")!, "execute").mockResolvedValue({ success: true, data: [] });
    // a long first reply (about 14k tokens) makes the next request, which re-sends it, too big
    fetchMock
      .mockResolvedValueOnce(completion({ role: "assistant", content: "Je cherche. " + "mot ".repeat(14_000), tool_calls: [call("c1", "search_orders", { status: "pending" })] }, undefined, "tool_calls"))
      .mockResolvedValueOnce(answer("never asked"));
    const result = await run("Combien de commandes en attente ?");
    expect(GROQ_TURN_TOKEN_BUDGET).toBe(12_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.stopReason).toBe("token_budget");
    expect(result.steps).toBe(1);
    expect(result.text).toContain("Je cherche.");
    expect(result.toolCalls).toHaveLength(1);
  });

  it("never lets the key reach a returned value, a log line, the request body or a thrown error", async () => {
    const seen: string[] = [];
    for (const level of ["debug", "info", "warn", "error", "log"] as const) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => void seen.push(args.map(String).join(" ")));
    }
    const returned: unknown[] = [];
    for (const scripted of [
      () => fetchMock.mockResolvedValueOnce(errorResponse(401, `Invalid key ${KEY}`)),
      () => fetchMock.mockResolvedValueOnce(errorResponse(429, `Limit for ${KEY}`, { "retry-after": "5" })),
      () => fetchMock.mockResolvedValueOnce(errorResponse(400, `Bad request, Authorization: Bearer ${KEY}`)),
      () => fetchMock.mockRejectedValue(new Error(`connect ECONNREFUSED while using ${KEY}`)),
      () => fetchMock.mockResolvedValueOnce(answer("fine")),
    ]) {
      fetchMock.mockReset();
      scripted();
      returned.push(await run("Bonjour"));
    }
    const bodies = fetchMock.mock.calls.map((c) => String(c[1]?.body ?? ""));
    const all = [JSON.stringify(returned), seen.join("\n"), bodies.join("\n")].join("\n");
    expect(all).not.toContain(KEY);
    expect(all).not.toMatch(/gsk_[A-Za-z0-9]{20,}/);
    expect(returned).toHaveLength(5);
    expect(seen.length).toBeGreaterThan(0); // the provider did log, so the scan above looked at something
  });

  it("scrubs the key out of what the MODEL says, in a final answer and in text beside a tool call", async () => {
    // The model's own words are untrusted: a customer message could make it echo a secret it was shown.
    fetchMock.mockResolvedValueOnce(answer(`Voici la cle : ${KEY} et aussi gsk_ZZZZZZZZZZZZZZZZZZZZZZZZZZZZ fin.`));
    const final = await run("Bonjour");
    expect(final.text).not.toContain(KEY);
    expect(final.text).not.toMatch(/gsk_[A-Za-z0-9]{20,}/);
    expect(final.text).toContain("Voici la cle"); // the rest of the sentence survives

    fetchMock.mockReset();
    fetchMock
      .mockResolvedValueOnce(
        completion(
          { role: "assistant", content: `Je cherche avec ${KEY}`, tool_calls: [call("c1", "no_such_tool", {})] },
          undefined,
          "tool_calls",
        ),
      )
      .mockResolvedValueOnce(answer("Termine."));
    const beside = await run("Bonjour");
    expect(beside.text).not.toContain(KEY);
    expect(beside.text).toContain("Je cherche avec");
    expect(beside.text).toContain("Termine.");
  });

  describe("Stop (an abort signal)", () => {
    it("a turn that was already stopped calls nothing: no model request, no tool", async () => {
      const search = vi.spyOn(getTool("search_orders")!, "execute").mockResolvedValue({ success: true, data: [] });
      const controller = new AbortController();
      controller.abort();
      const result = await run("Combien de commandes en attente ?", { signal: controller.signal });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(search).not.toHaveBeenCalled();
      expect(result.stopReason).toBe("aborted");
      expect(result.steps).toBe(0);
      expect(result.toolCalls).toEqual([]);
      expect(result.error).toBeUndefined();
    });

    it("Stop pressed while the model is answering: its tool calls are not run and no second request is made", async () => {
      const search = vi.spyOn(getTool("search_orders")!, "execute").mockResolvedValue({ success: true, data: [] });
      const controller = new AbortController();
      fetchMock.mockImplementationOnce(async () => {
        controller.abort(); // the seller pressed Stop while this request was in flight
        return toolStep(call("c1", "search_orders", { status: "pending" }));
      });
      fetchMock.mockResolvedValueOnce(answer("never asked"));
      const result = await run("Combien de commandes en attente ?", { signal: controller.signal });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(search).not.toHaveBeenCalled();
      expect(result.stopReason).toBe("aborted");
      expect(result.toolCalls).toEqual([]);
      expect(result.actionProposals).toEqual([]);
    });

    it("Stop pressed between two tool calls of one step: the second tool is not run and nothing more is asked", async () => {
      const controller = new AbortController();
      const search = vi.spyOn(getTool("search_orders")!, "execute").mockImplementation(async () => {
        controller.abort();
        return { success: true, data: [] };
      });
      const stats = vi.spyOn(getTool("get_stats")!, "execute").mockResolvedValue({ success: true, data: {} });
      fetchMock.mockResolvedValueOnce(
        toolStep(call("c1", "search_orders", { status: "pending" }), call("c2", "get_stats", {})),
      );
      fetchMock.mockResolvedValueOnce(answer("never asked"));
      const result = await run("Combien de commandes en attente ?", { signal: controller.signal });
      expect(search).toHaveBeenCalledTimes(1);
      expect(stats).not.toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(result.stopReason).toBe("aborted");
      expect(result.toolCalls.map((c) => c.name)).toEqual(["search_orders"]);
    });

    it("a signal that is never fired changes nothing", async () => {
      fetchMock.mockResolvedValueOnce(answer("Bonjour !"));
      const result = await run("Bonjour", { signal: new AbortController().signal });
      expect(result.stopReason).toBe("answered");
      expect(result.text).toBe("Bonjour !");
      expect(result.steps).toBe(1);
    });
  });
});
