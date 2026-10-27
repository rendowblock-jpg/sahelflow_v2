/**
 * Which AI answers a chat turn, in what order, and how a Groq result becomes
 * the shapes the chat routes already send. Every provider call here is a fake
 * passed through `deps`: nothing touches a network or a database.
 */
import { describe, expect, it } from "vitest";

import { createQuotaLedger, quotaLedger } from "@/lib/ai/providers/quota-ledger";
import type { AiActionProposalToolResult } from "@/lib/ai/actions/proposal-runtime";
import type { GroqAgentResult } from "../groq-agent";
import { chooseChatProviders, groqToAgentResult, groqToStreamEvents } from "../chat-provider";

const NOW = new Date("2026-10-26T10:00:00.000Z");
// Synthetic, key-shaped; never a real credential.
const KEY = "gsk_" + "A1b2C3d4E5f6G7h8I9j0K1l2M3n4";
const BOTH = { geminiConfigured: true, groqApiKey: KEY, hasImages: false, now: NOW } as const;

describe("chooseChatProviders", () => {
  it("Groq first when the order says so and both keys exist", () => {
    expect(chooseChatProviders({ ...BOTH, order: ["groq", "gemini", "openai"] })).toEqual({ chain: ["groq", "gemini"] });
  });

  it("Gemini first when the order says so", () => {
    expect(chooseChatProviders({ ...BOTH, order: ["gemini", "groq", "openai"] })).toEqual({ chain: ["gemini", "groq"] });
  });

  it("only Gemini: a missing, empty or blank Groq key leaves Gemini alone", () => {
    for (const groqApiKey of [undefined, null, "", "   "]) {
      expect(chooseChatProviders({ ...BOTH, groqApiKey, order: ["groq", "gemini", "openai"] })).toEqual({ chain: ["gemini"] });
    }
  });

  it("only Groq: Gemini not configured", () => {
    expect(chooseChatProviders({ ...BOTH, geminiConfigured: false, order: ["gemini", "groq", "openai"] })).toEqual({ chain: ["groq"] });
  });

  it("a paused Groq leaves Gemini first (and alone)", () => {
    const ledger = createQuotaLedger();
    ledger.recordQuotaHit("groq", 600, NOW);
    expect(chooseChatProviders({ ...BOTH, ledger, order: ["groq", "gemini", "openai"] })).toEqual({ chain: ["gemini"] });
  });

  it("a pause that has ended no longer counts", () => {
    const ledger = createQuotaLedger();
    ledger.recordQuotaHit("groq", 600, NOW);
    const later = new Date(NOW.getTime() + 601_000);
    expect(chooseChatProviders({ ...BOTH, ledger, now: later, order: ["groq", "gemini", "openai"] })).toEqual({ chain: ["groq", "gemini"] });
  });

  it("both paused: the candidates in order, so the first attempt gives the plain limit error", () => {
    const ledger = createQuotaLedger();
    ledger.recordQuotaHit("groq", 600, NOW);
    ledger.recordQuotaHit("gemini", 600, NOW);
    expect(chooseChatProviders({ ...BOTH, ledger, order: ["groq", "gemini", "openai"] })).toEqual({ chain: ["groq", "gemini"] });
    expect(chooseChatProviders({ ...BOTH, ledger, order: ["gemini", "groq", "openai"] })).toEqual({ chain: ["gemini", "groq"] });
  });

  it("uses the process-wide ledger when none is passed", () => {
    quotaLedger.recordQuotaHit("groq", 600, NOW);
    try {
      expect(chooseChatProviders({ ...BOTH, order: ["groq", "gemini", "openai"] })).toEqual({ chain: ["gemini"] });
    } finally {
      quotaLedger.clear("groq");
    }
  });

  it("images with both keys: Gemini only", () => {
    expect(chooseChatProviders({ ...BOTH, hasImages: true, order: ["groq", "gemini", "openai"] })).toEqual({ chain: ["gemini"] });
  });

  it("images with only a Groq key: nothing can read them", () => {
    expect(chooseChatProviders({ ...BOTH, geminiConfigured: false, hasImages: true, order: ["groq", "gemini", "openai"] })).toEqual({
      chain: [],
      none: "images_need_gemini",
    });
  });

  it("no keys at all: no_key (with or without images)", () => {
    const none = { geminiConfigured: false, groqApiKey: undefined, now: NOW, order: ["groq", "gemini", "openai"] } as const;
    expect(chooseChatProviders({ ...none, hasImages: false })).toEqual({ chain: [], none: "no_key" });
    expect(chooseChatProviders({ ...none, hasImages: true })).toEqual({ chain: [], none: "no_key" });
  });

  it("openai is skipped: chat on a ChatGPT plan is not built", () => {
    expect(chooseChatProviders({ ...BOTH, order: ["openai", "groq", "gemini"] })).toEqual({ chain: ["groq", "gemini"] });
    expect(chooseChatProviders({ ...BOTH, order: ["openai"] })).toEqual({ chain: [], none: "no_key" });
  });

  it("repeats, unknown names and junk in the list do not crash and never repeat a provider", () => {
    const order = ["groq", "groq", "bogus", "gemini", "gemini", 42, null, undefined, "openai"] as unknown as string[];
    expect(chooseChatProviders({ ...BOTH, order })).toEqual({ chain: ["groq", "gemini"] });
  });

  it("does not change the list it is given", () => {
    const order = ["openai", "groq", "gemini"];
    chooseChatProviders({ ...BOTH, order });
    expect(order).toEqual(["openai", "groq", "gemini"]);
  });
});

function groqResult(over: Partial<GroqAgentResult> = {}): GroqAgentResult {
  return { text: "", toolCalls: [], rejectedCalls: [], actionProposals: [], usage: {}, estimatedTokens: 0, steps: 1, stopReason: "answered", ...over };
}
const PROPOSAL = { status: "proposal_recorded", id: "p1" } as unknown as AiActionProposalToolResult;
const CALL_A = { name: "search_orders", args: { q: "ali" }, result: { rows: 2 } };
const CALL_B = { name: "get_stock", args: { sku: "X1" }, result: { left: 4 } };
const FAILURE = { code: "GROQ_RATE_LIMITED", message: "Limite atteinte.", retryAfterSeconds: 30, paused: false };

describe("groqToAgentResult", () => {
  it("a plain answer: response is the text, no error and no proposal key", () => {
    expect(groqToAgentResult(groqResult({ text: "Bonjour" }))).toStrictEqual({ response: "Bonjour", toolCalls: [] });
  });

  it("carries the executed tool calls", () => {
    const toolCalls = [CALL_A, CALL_B];
    const out = groqToAgentResult(groqResult({ text: "ok", toolCalls }));
    expect(out.toolCalls).toBe(toolCalls);
  });

  it("carries the action proposal", () => {
    const out = groqToAgentResult(groqResult({ text: "Proposition enregistrée.", stopReason: "proposal", actionProposal: PROPOSAL, actionProposals: [PROPOSAL] }));
    expect(out.actionProposal).toBe(PROPOSAL);
    expect(out.error).toBeUndefined();
  });

  it("an error becomes error = its message, and keeps the partial text", () => {
    const out = groqToAgentResult(groqResult({ text: "début", stopReason: "error", error: FAILURE }));
    expect(out).toStrictEqual({ response: "début", toolCalls: [], error: "Limite atteinte." });
  });

  it("adds no field beyond response, toolCalls, actionProposal, error", () => {
    const out = groqToAgentResult(groqResult({ text: "t", toolCalls: [CALL_A], actionProposal: PROPOSAL, stopReason: "error", error: FAILURE, usage: { totalTokens: 9 } }));
    expect(Object.keys(out).sort()).toEqual(["actionProposal", "error", "response", "toolCalls"]);
  });
});

describe("groqToStreamEvents", () => {
  it("a plain answer: one text_delta with the whole text, then done", () => {
    expect(groqToStreamEvents(groqResult({ text: "Bonjour" }))).toStrictEqual([
      { type: "text_delta", text: "Bonjour" },
      { type: "done", response: "Bonjour", toolCalls: [] },
    ]);
  });

  it("each executed call gives tool_call then tool_result, call after call, then the text, then done", () => {
    const toolCalls = [CALL_A, CALL_B];
    expect(groqToStreamEvents(groqResult({ text: "fin", toolCalls }))).toStrictEqual([
      { type: "tool_call", name: "search_orders", args: { q: "ali" } },
      { type: "tool_result", name: "search_orders", result: { rows: 2 } },
      { type: "tool_call", name: "get_stock", args: { sku: "X1" } },
      { type: "tool_result", name: "get_stock", result: { left: 4 } },
      { type: "text_delta", text: "fin" },
      { type: "done", response: "fin", toolCalls },
    ]);
  });

  it("the proposal comes after the tool events and before the text, and is repeated on done", () => {
    const events = groqToStreamEvents(groqResult({ text: "Proposition enregistrée.", toolCalls: [CALL_A], stopReason: "proposal", actionProposal: PROPOSAL }));
    expect(events.map((e) => e.type)).toEqual(["tool_call", "tool_result", "action_proposal", "text_delta", "done"]);
    expect(events[2]).toStrictEqual({ type: "action_proposal", proposal: PROPOSAL });
    expect(events[4]).toStrictEqual({ type: "done", response: "Proposition enregistrée.", toolCalls: [CALL_A], actionProposal: PROPOSAL });
  });

  it("an empty text gives no text_delta", () => {
    expect(groqToStreamEvents(groqResult({ text: "", stopReason: "empty" }))).toStrictEqual([{ type: "done", response: "", toolCalls: [] }]);
  });

  it("done has no signal (that field is Gemini's; absent means the UI shows none)", () => {
    const done = groqToStreamEvents(groqResult({ text: "x" })).at(-1);
    expect(done?.type).toBe("done");
    expect(done && "signal" in done).toBe(false);
  });

  it("an error with partial text ends with the error event and no done", () => {
    const events = groqToStreamEvents(groqResult({ text: "début", stopReason: "error", error: FAILURE }));
    expect(events).toStrictEqual([
      { type: "text_delta", text: "début" },
      { type: "error", message: "Limite atteinte.", code: "GROQ_RATE_LIMITED" },
    ]);
    expect(events.some((e) => e.type === "done")).toBe(false);
  });

  it("an error after a tool keeps the tool events, then one error", () => {
    const events = groqToStreamEvents(groqResult({ toolCalls: [CALL_A], stopReason: "error", error: FAILURE }));
    expect(events.map((e) => e.type)).toEqual(["tool_call", "tool_result", "error"]);
  });

  it("adds no field that could carry more than the answer (no usage, no retry delay, no rejected calls)", () => {
    const events = groqToStreamEvents(groqResult({ text: "t", rejectedCalls: [{ name: "zz", reason: "unknown_tool" }], usage: { totalTokens: 9 }, stopReason: "error", error: FAILURE }));
    const json = JSON.stringify(events);
    expect(json).not.toContain("retryAfterSeconds");
    expect(json).not.toContain("usage");
    expect(json).not.toContain("rejected");
    expect(Object.keys(events.at(-1) ?? {}).sort()).toEqual(["code", "message", "type"]);
  });
});

// @@STEP3@@
