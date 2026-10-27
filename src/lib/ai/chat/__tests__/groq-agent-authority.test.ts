/**
 * Equivalence of authority: the SAME scripted tool call goes through the Gemini
 * path (agent.ts `execute`, and a whole `runAgent` turn) and through the Groq
 * loop, with the same ToolContext, over the REAL registry (tool bodies spied).
 * All HTTP is mocked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/secrets", () => ({ getSecret: vi.fn(async () => "test-gemini-key") }));
vi.mock("@/lib/ai/gemini/runtime-preferences", () => ({
  loadGeminiRuntimePreferences: vi.fn(async () => ({ model: "gemini-3.5-flash", thinkingLevel: "MINIMAL" })),
}));

import { execute, historySafeToolResult, runAgent } from "../agent";
import { runGroqAgent } from "../groq-agent";
import { aiUnknownToolMessage } from "../locale-context";
import { getAllToolDefinitions, getTool, type ToolContext } from "../tools/registry";
import { aiToolRefusalResult } from "../tools/tool-refusal";
import { createQuotaLedger } from "@/lib/ai/providers/quota-ledger";

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

const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
const geminiCall = (name: string, args: Record<string, unknown>) =>
  json({ candidates: [{ content: { parts: [{ functionCall: { name, args } }] } }] });
const geminiText = (text: string) => json({ candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP" }] });
const groqCall = (name: string, args: Record<string, unknown>) =>
  json({ choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name, arguments: JSON.stringify(args) } }] }, finish_reason: "tool_calls" }] });
const groqText = (text: string) => json({ choices: [{ message: { role: "assistant", content: text }, finish_reason: "stop" }] });

async function viaGemini(question: string, name: string, args: Record<string, unknown>) {
  const fetchMock = vi.fn().mockResolvedValueOnce(geminiCall(name, args)).mockResolvedValueOnce(geminiText("ok"));
  vi.stubGlobal("fetch", fetchMock);
  const out = await runAgent([], question, CONTEXT, "fr");
  let modelSaw: unknown;
  if (fetchMock.mock.calls.length > 1) {
    const second = JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string);
    modelSaw = second.contents.at(-1).parts[0]?.functionResponse.response.result;
  }
  return { out, modelSaw };
}

async function viaGroq(question: string, name: string, args: Record<string, unknown>) {
  const fetchMock = vi.fn().mockResolvedValueOnce(groqCall(name, args)).mockResolvedValueOnce(groqText("ok"));
  vi.stubGlobal("fetch", fetchMock);
  const out = await runGroqAgent({
    apiKey: "gsk_" + "Z9y8X7w6V5u4T3s2R1q0P9o8N7m6",
    history: [],
    userMessage: question,
    locale: "fr",
    context: CONTEXT,
    deps: { ledger: createQuotaLedger(() => NOW), now: () => NOW, retryDelayMs: 0 },
  });
  let modelSaw: unknown;
  if (fetchMock.mock.calls.length > 1) {
    const second = JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string);
    modelSaw = JSON.parse(second.messages.find((m: { role: string }) => m.role === "tool").content);
  }
  return { out, modelSaw };
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("Groq loop and Gemini path share one execution authority", () => {
  it("search_orders {status: pending}: same body call, same stored result, same text the model reads", async () => {
    const data = [{ orderNumber: "SF-1042", status: "pending", totalPrice: 4500 }];
    const body = vi.spyOn(getTool("search_orders")!, "execute").mockResolvedValue({ success: true, data });
    const args = { status: "pending" };

    const direct = await execute({ name: "search_orders", args }, CONTEXT, "fr");
    const gemini = await viaGemini("Mes commandes en attente ?", "search_orders", args);
    const groq = await viaGroq("Mes commandes en attente ?", "search_orders", args);

    expect(body).toHaveBeenCalledTimes(3);
    for (const [calledArgs, calledContext] of body.mock.calls) {
      expect(calledArgs).toEqual(args);
      expect(calledContext).toBe(CONTEXT);
    }
    expect(direct.result).toEqual(data);
    expect(gemini.out.toolCalls[0]?.result).toEqual(direct.result);
    expect(groq.out.toolCalls[0]?.result).toEqual(direct.result);
    expect(groq.out.toolCalls[0]?.args).toEqual(gemini.out.toolCalls[0]?.args);
    // what the remote model is shown: the same redacted value on both wires
    expect(groq.modelSaw).toEqual(gemini.modelSaw);
    expect(groq.modelSaw).toEqual(historySafeToolResult("search_orders", direct.result));
    expect(groq.modelSaw).toEqual([expect.objectContaining({ orderNumber: "SF-1042", status: "pending" })]);
    expect(groq.out.text).toBe("ok");
    expect(gemini.out.response).toBe("ok");
  });

  it("a permission refusal from the registry reaches the model identically", async () => {
    vi.spyOn(getTool("search_orders")!, "execute").mockResolvedValue({ success: false, error: "x", refusal: { code: "AI_TOOL_NOT_PERMITTED" } });
    const gemini = await viaGemini("Mes commandes en attente ?", "search_orders", { status: "pending" });
    const groq = await viaGroq("Mes commandes en attente ?", "search_orders", { status: "pending" });
    expect(groq.out.toolCalls[0]?.result).toEqual(aiToolRefusalResult({ code: "AI_TOOL_NOT_PERMITTED" }));
    expect(groq.out.toolCalls[0]?.result).toEqual(gemini.out.toolCalls[0]?.result);
    expect(groq.modelSaw).toEqual(gemini.modelSaw);
  });

  it("a sensitive tool (update_product_price) creates the same proposal object and ends the turn on both paths", async () => {
    const body = vi.spyOn(getTool("update_product_price")!, "execute").mockResolvedValue({ success: true, data: proposalResult() });
    const args = { productId: "product-1", newPrice: 1200 };

    const direct = await execute({ name: "update_product_price", args }, CONTEXT, "fr");
    const gemini = await viaGemini("Change le prix du produit à 1200 DA", "update_product_price", args);
    const groq = await viaGroq("Change le prix du produit à 1200 DA", "update_product_price", args);

    expect(body).toHaveBeenCalledTimes(3);
    expect(direct.actionProposal).toEqual(proposalResult());
    expect(gemini.out.actionProposal).toEqual(direct.actionProposal);
    expect(groq.out.actionProposal).toEqual(direct.actionProposal);
    expect(groq.out.actionProposals).toEqual([direct.actionProposal]);
    // the stored tool result is the history-safe one (digest removed) on both
    expect(groq.out.toolCalls[0]?.result).toEqual(gemini.out.toolCalls[0]?.result);
    expect(JSON.stringify(groq.out.toolCalls[0]?.result)).not.toContain("1".repeat(64));
    // same recorded-proposal sentence; no second model request on either path
    expect(groq.out.text).toBe(gemini.out.response);
    expect(groq.out.stopReason).toBe("proposal");
    expect(groq.modelSaw).toBeUndefined();
    expect(gemini.modelSaw).toBeUndefined();
  });

  it("an unknown tool name gets the same refusal text on both paths", async () => {
    const direct = await execute({ name: "no_such_tool", args: {} }, CONTEXT, "fr");
    const gemini = await viaGemini("Mes commandes en attente ?", "no_such_tool", {});
    const groq = await viaGroq("Mes commandes en attente ?", "no_such_tool", {});
    const expected = { error: aiUnknownToolMessage("fr", "no_such_tool") };
    expect(direct.result).toEqual(expected);
    // Gemini's redaction layer shows the model `null` for a name it does not know; the Groq loop shows
    // the same fixed sentence the stored result carries (constants + the model's own name, no records).
    expect(gemini.modelSaw).toBeNull();
    expect(gemini.out.toolCalls[0]?.result).toEqual(expected);
    expect(groq.modelSaw).toEqual(expected);
    expect(groq.out.toolCalls).toEqual([]);
    expect(groq.out.rejectedCalls).toEqual([{ name: "no_such_tool", reason: "unknown_tool" }]);
  });

  it("the policy-blocked assign_order_to_delivery is never offered, never runs its body, and gets the same not-available answer on both paths", async () => {
    expect(getAllToolDefinitions().map((t) => t.name)).not.toContain("assign_order_to_delivery");
    const tool = getTool("assign_order_to_delivery");
    expect(tool).toBeDefined();
    const body = vi.spyOn(tool!, "execute"); // calls through to the real blocked gate
    const args = { orderNumber: "SF-1042", provider: "yalidine" };

    // Gemini path: a model that invents the name gets the "not available" result (PB-GEMINI-BLOCKED-TOOL-THROW;
    // it used to throw the coded error out of the whole turn) and the registry entry is never even entered.
    const direct = await execute({ name: "assign_order_to_delivery", args }, CONTEXT, "fr");
    expect(direct.result).toEqual({ error: aiUnknownToolMessage("fr", "assign_order_to_delivery") });
    expect(direct.actionProposal).toBeUndefined();
    expect(body).not.toHaveBeenCalled();

    // Groq loop: the name is not offered, so it never reaches `execute`; the model gets an error result.
    const groq = await viaGroq("Livre la commande SF-1042 avec Yalidine", "assign_order_to_delivery", args);
    expect(body).not.toHaveBeenCalled();
    expect(groq.out.toolCalls).toEqual([]);
    // A policy-blocked tool is not in the assistant's tool list at all, so the loop counts it as unknown.
    expect(groq.out.rejectedCalls).toEqual([{ name: "assign_order_to_delivery", reason: "unknown_tool" }]);
    expect(String((groq.modelSaw as { error: string }).error)).toContain("assign_order_to_delivery");
    expect(groq.modelSaw).toEqual(direct.result); // the same words on both paths
    expect(groq.out.actionProposals).toEqual([]);
  });
});
