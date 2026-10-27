/**
 * PB-GEMINI-BLOCKED-TOOL-THROW. Gemini is never offered the declaration of a
 * policy-blocked tool (assign_order_to_delivery), but a model can still invent
 * the name. Before this fix the registry gate threw
 * AI_PROVIDER_ACTION_NOT_CONVERGED out of agent.ts `execute`, nothing caught it,
 * and the WHOLE chat turn failed. Now the model gets the same "not available"
 * result as for any unknown tool name and the turn goes on. Real registry; all
 * HTTP is mocked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/secrets", () => ({ getSecret: vi.fn(async () => "test-gemini-key") }));
vi.mock("@/lib/ai/gemini/runtime-preferences", () => ({
  loadGeminiRuntimePreferences: vi.fn(async () => ({ model: "gemini-3.5-flash", thinkingLevel: "MINIMAL" })),
}));

import { SahelFlowError } from "@/types/errors";
import { execute, runAgent, runAgentStream, type AgentStreamEvent } from "../agent";
import { aiUnknownToolMessage } from "../locale-context";
import { getTool, type ToolContext } from "../tools/registry";

const BLOCKED = "assign_order_to_delivery";
const ARGS = { orderNumber: "SF-1042", provider: "yalidine" };
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

const json = (value: unknown) =>
  new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
const call = (name: string) => json({ candidates: [{ content: { parts: [{ functionCall: { name, args: ARGS } }] } }] });
const text = (t: string) => json({ candidates: [{ content: { parts: [{ text: t }] }, finishReason: "STOP" }] });
const sse = (chunk: object) =>
  new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(chunk)}\n\n`));
        controller.close();
      },
    }),
    { status: 200, headers: { "content-type": "text/event-stream" } },
  );

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("a model that invents the name of a policy-blocked tool", () => {
  it("execute() answers 'not available' like for an unknown name and never enters the registry gate", async () => {
    const gate = vi.spyOn(getTool(BLOCKED)!, "execute"); // calls through to the real blocked gate
    const out = await execute({ name: BLOCKED, args: ARGS }, CONTEXT, "fr");
    expect(out).toEqual({ result: { error: aiUnknownToolMessage("fr", BLOCKED) } });
    expect(out.actionProposal).toBeUndefined();
    expect(gate).not.toHaveBeenCalled();
  });

  it("the sentence follows the seller's language", async () => {
    for (const locale of ["fr", "en", "ar"] as const) {
      const out = await execute({ name: BLOCKED, args: ARGS }, CONTEXT, locale);
      expect(out.result).toEqual({ error: aiUnknownToolMessage(locale, BLOCKED) });
    }
  });

  it("runAgent: the turn goes on and the model answers (it used to throw out of runAgent)", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(call(BLOCKED)).mockResolvedValueOnce(text("Je ne peux pas assigner de livraison."));
    vi.stubGlobal("fetch", fetchMock);
    const result = await runAgent([], "Livre la commande SF-1042 avec Yalidine", CONTEXT, "fr");
    expect(result.error).toBeUndefined();
    expect(result.response).toBe("Je ne peux pas assigner de livraison.");
    expect(result.actionProposal).toBeUndefined();
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]).toMatchObject({ name: BLOCKED, result: { error: aiUnknownToolMessage("fr", BLOCKED) } });
    expect(fetchMock).toHaveBeenCalledTimes(2); // the model was asked again, with the tool result
  });

  it("runAgentStream: tool_call, tool_result, text, done; no error event", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(sse({ candidates: [{ content: { parts: [{ functionCall: { name: BLOCKED, args: ARGS } }] } }] }))
      .mockResolvedValueOnce(sse({ candidates: [{ content: { parts: [{ text: "Je ne peux pas le faire." }] } }] }));
    vi.stubGlobal("fetch", fetchMock);
    const events: AgentStreamEvent[] = [];
    for await (const event of runAgentStream([], "Livre la commande SF-1042", undefined, CONTEXT, "fr")) events.push(event);
    expect(events.map((e) => e.type)).toEqual(["tool_call", "tool_result", "text_delta", "done"]);
    const result = events.find((e) => e.type === "tool_result");
    expect(result).toMatchObject({ result: { error: aiUnknownToolMessage("fr", BLOCKED) } });
    expect(events.at(-1)).toMatchObject({ type: "done", response: "Je ne peux pas le faire." });
  });
});

describe("only the blocked class is turned into an answer", () => {
  it("any other thrown error of a registered tool still propagates", async () => {
    vi.spyOn(getTool("search_orders")!, "execute").mockRejectedValue(new SahelFlowError("boom", "SOME_OTHER_CODE", 500));
    await expect(execute({ name: "search_orders", args: {} }, CONTEXT, "fr")).rejects.toMatchObject({ code: "SOME_OTHER_CODE" });
  });

  it("a sensitive (not blocked) tool still reaches its gate", async () => {
    const gate = vi.spyOn(getTool("update_product_price")!, "execute").mockResolvedValue({ success: false, error: "x" });
    await execute({ name: "update_product_price", args: { productId: "p", newPrice: 1 } }, CONTEXT, "fr");
    expect(gate).toHaveBeenCalledTimes(1);
  });
});
