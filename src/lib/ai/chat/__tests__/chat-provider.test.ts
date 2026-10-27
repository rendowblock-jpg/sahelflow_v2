/**
 * Which AI answers a chat turn, in what order, and how a Groq result becomes
 * the shapes the chat routes already send. Every provider call here is a fake
 * passed through `deps`: nothing touches a network or a database.
 */
import { describe, expect, it, vi } from "vitest";

import { createQuotaLedger, quotaLedger } from "@/lib/ai/providers/quota-ledger";
import type { AiActionProposalToolResult } from "@/lib/ai/actions/proposal-runtime";
import type { AgentMessage, AgentResult, AgentStreamEvent } from "../agent";
import type { GroqAgentResult } from "../groq-agent";
import type { ToolContext } from "../tools/registry";
import {
  chooseChatProviders,
  groqToAgentResult,
  groqToStreamEvents,
  runChatTurn,
  runChatTurnStream,
  type ChatTurnDeps,
  type ChatTurnInput,
} from "../chat-provider";

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

// ---- the turn runners: every provider is a fake ----

const CONTEXT = {} as unknown as ToolContext;
const HISTORY = [{ role: "user", content: "Salut" }] as unknown as AgentMessage[];
const SIGNAL = new AbortController().signal;
const IMAGES = [{ mediaType: "image/png", bytes: Buffer.from("png") }];
const GROQ_ORDER = ["groq", "gemini", "openai"];
const GEMINI_ORDER = ["gemini", "groq", "openai"];

function turn(over: Partial<ChatTurnInput> = {}): ChatTurnInput {
  return {
    history: HISTORY,
    message: "Combien de commandes ?",
    toolContext: CONTEXT,
    locale: "fr",
    shopContextNote: "note",
    order: GROQ_ORDER,
    geminiConfigured: true,
    groqApiKey: KEY,
    images: [],
    signal: SIGNAL,
    ...over,
  };
}
type Fake = ReturnType<typeof vi.fn>;
const boom = (name: string): Fake =>
  vi.fn(() => {
    throw new Error(`${name} must not be called`);
  });
const resolves = (value: unknown): Fake => vi.fn(async () => value);
const streams = (events: AgentStreamEvent[]): Fake =>
  vi.fn(() =>
    (async function* () {
      yield* events;
    })(),
  );
function fakes(o: { gemini?: Fake; stream?: Fake; groq?: Fake; ledger?: ReturnType<typeof createQuotaLedger> }): ChatTurnDeps {
  return {
    runGemini: o.gemini ?? boom("runGemini"),
    streamGemini: o.stream ?? boom("streamGemini"),
    runGroq: o.groq ?? boom("runGroq"),
    ledger: o.ledger ?? createQuotaLedger(),
    now: () => NOW,
  } as unknown as ChatTurnDeps;
}
async function drain(gen: ReturnType<typeof runChatTurnStream>) {
  const events: AgentStreamEvent[] = [];
  for (;;) {
    const step = await gen.next();
    if (step.done) return { events, provider: step.value.provider };
    events.push(step.value);
  }
}
const order = (a: Fake, b: Fake) => (a.mock.invocationCallOrder[0] ?? 0) < (b.mock.invocationCallOrder[0] ?? 0);

const GEM_OK: AgentResult = { response: "Gemini dit bonjour", toolCalls: [CALL_B] };
const GEM_FAIL: AgentResult = { response: "", toolCalls: [], error: "Gemini indisponible" };
const GROQ_OK = groqResult({ text: "Groq dit bonjour" });
const GROQ_FAIL = groqResult({ stopReason: "error", error: FAILURE });
const GEM_EVENTS: AgentStreamEvent[] = [
  { type: "tool_call", name: "get_stock", args: { sku: "X1" } },
  { type: "tool_result", name: "get_stock", result: { left: 4 } },
  { type: "text_delta", text: "Gemini " },
  { type: "text_delta", text: "dit bonjour" },
  { type: "done", response: "Gemini dit bonjour", toolCalls: [CALL_B] },
];
const GEM_ERR: AgentStreamEvent = { type: "error", message: "Gemini indisponible", code: "GEMINI_UNAVAILABLE" };

describe("runChatTurn", () => {
  it("only Gemini: today's behaviour, one runAgent call with the same arguments, the result unchanged", async () => {
    const gemini = resolves(GEM_OK);
    const out = await runChatTurn(turn({ groqApiKey: undefined }), fakes({ gemini }));
    expect(gemini).toHaveBeenCalledTimes(1);
    expect(gemini).toHaveBeenCalledWith(HISTORY, "Combien de commandes ?", CONTEXT, "fr", "note");
    expect(out).toEqual({ ...GEM_OK, provider: "gemini" });
  });

  it("only Gemini: a Gemini error is returned as it is, with no second call", async () => {
    const gemini = resolves(GEM_FAIL);
    const out = await runChatTurn(turn({ groqApiKey: undefined }), fakes({ gemini }));
    expect(gemini).toHaveBeenCalledTimes(1);
    expect(out).toEqual({ ...GEM_FAIL, provider: "gemini" });
  });

  it("Groq first and fine: Gemini is never called, and Groq gets exactly the documented input", async () => {
    const groq = resolves(GROQ_OK);
    const out = await runChatTurn(turn(), fakes({ groq }));
    expect(groq).toHaveBeenCalledTimes(1);
    expect(groq).toHaveBeenCalledWith({ apiKey: KEY, history: HISTORY, userMessage: "Combien de commandes ?", locale: "fr", context: CONTEXT, shopContextNote: "note" });
    expect(out).toEqual({ response: "Groq dit bonjour", toolCalls: [], provider: "groq" });
  });

  it("Groq error before any tool: Gemini answers, each called once, Groq first", async () => {
    const groq = resolves(GROQ_FAIL);
    const gemini = resolves(GEM_OK);
    const out = await runChatTurn(turn(), fakes({ groq, gemini }));
    expect(groq).toHaveBeenCalledTimes(1);
    expect(gemini).toHaveBeenCalledTimes(1);
    expect(order(groq, gemini)).toBe(true);
    expect(out).toEqual({ ...GEM_OK, provider: "gemini" });
  });

  it("Groq error AFTER a tool ran: no Gemini call, the error is returned", async () => {
    const groq = resolves(groqResult({ toolCalls: [CALL_A], stopReason: "error", error: FAILURE }));
    const out = await runChatTurn(turn(), fakes({ groq }));
    expect(groq).toHaveBeenCalledTimes(1);
    expect(out).toEqual({ response: "", toolCalls: [CALL_A], error: "Limite atteinte.", errorCode: "GROQ_RATE_LIMITED", provider: "groq" });
  });

  it("Groq error after a proposal was recorded: no Gemini call", async () => {
    const groq = resolves(groqResult({ actionProposal: PROPOSAL, stopReason: "error", error: FAILURE }));
    const out = await runChatTurn(turn(), fakes({ groq }));
    expect(out.error).toBe("Limite atteinte.");
    expect(out.actionProposal).toBe(PROPOSAL);
  });

  it("Gemini error, then Groq answers (Gemini first)", async () => {
    const gemini = resolves(GEM_FAIL);
    const groq = resolves(GROQ_OK);
    const out = await runChatTurn(turn({ order: GEMINI_ORDER }), fakes({ gemini, groq }));
    expect(order(gemini, groq)).toBe(true);
    expect(gemini).toHaveBeenCalledTimes(1);
    expect(groq).toHaveBeenCalledTimes(1);
    expect(out).toEqual({ response: "Groq dit bonjour", toolCalls: [], provider: "groq" });
  });

  it("Gemini error after a tool ran: no Groq call", async () => {
    const gemini = resolves({ response: "", toolCalls: [CALL_A], error: "Gemini indisponible" });
    const out = await runChatTurn(turn({ order: GEMINI_ORDER }), fakes({ gemini }));
    expect(out.error).toBe("Gemini indisponible");
    expect(out.provider).toBe("gemini");
  });

  it("both fail: the LAST error is returned and the first provider is not called again", async () => {
    const groq = resolves(GROQ_FAIL);
    const gemini = resolves(GEM_FAIL);
    const out = await runChatTurn(turn(), fakes({ groq, gemini }));
    expect(groq).toHaveBeenCalledTimes(1);
    expect(gemini).toHaveBeenCalledTimes(1);
    expect(out).toEqual({ ...GEM_FAIL, provider: "gemini" });
  });

  it("a proposal ends the turn on the Groq path", async () => {
    const groq = resolves(groqResult({ text: "Proposition enregistrée.", toolCalls: [CALL_A], stopReason: "proposal", actionProposal: PROPOSAL }));
    const out = await runChatTurn(turn(), fakes({ groq }));
    expect(out).toEqual({ response: "Proposition enregistrée.", toolCalls: [CALL_A], actionProposal: PROPOSAL, provider: "groq" });
  });

  it("a paused Groq is not called: Gemini answers", async () => {
    const ledger = createQuotaLedger();
    ledger.recordQuotaHit("groq", 600, NOW);
    const gemini = resolves(GEM_OK);
    const out = await runChatTurn(turn(), fakes({ gemini, ledger }));
    expect(out.provider).toBe("gemini");
  });

  it("images: Gemini only, Groq never called", async () => {
    const gemini = resolves(GEM_OK);
    const out = await runChatTurn(turn({ images: IMAGES }), fakes({ gemini }));
    expect(out.provider).toBe("gemini");
    expect(gemini).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["fr", "Aucune IA n'est configurée. Ajoutez une clé dans Paramètres → Intelligence artificielle."],
    ["en", "No AI is set up. Add a key in Settings → Artificial intelligence."],
    ["ar", "لم يتم إعداد أي ذكاء اصطناعي. أضف مفتاحًا من الإعدادات ← الذكاء الاصطناعي."],
  ] as const)("no key (%s): provider null, empty response, fixed text, nothing called", async (locale, text) => {
    const out = await runChatTurn(turn({ locale, geminiConfigured: false, groqApiKey: undefined }), fakes({}));
    expect(out).toEqual({ response: "", toolCalls: [], error: text, errorCode: "AI_KEY_MISSING", provider: null });
  });

  it.each([
    ["fr", "Seul Gemini lit les images. Ajoutez une clé Gemini ou envoyez le message sans image."],
    ["en", "Only Gemini reads images. Add a Gemini key or send the message without an image."],
    ["ar", "الصور يقرؤها Gemini فقط. أضف مفتاح Gemini أو أرسل الرسالة بدون صورة."],
  ] as const)("images with only a Groq key (%s): fixed text, Groq not called", async (locale, text) => {
    const out = await runChatTurn(turn({ locale, geminiConfigured: false, images: IMAGES }), fakes({}));
    expect(out).toEqual({ response: "", toolCalls: [], error: text, errorCode: "AI_IMAGES_NEED_GEMINI", provider: null });
  });
});

describe("runChatTurnStream", () => {
  it("only Gemini: one runAgentStream call with the same arguments, the very same events in the same order", async () => {
    const stream = streams(GEM_EVENTS);
    const out = await drain(runChatTurnStream(turn({ groqApiKey: undefined, images: IMAGES }), fakes({ stream })));
    expect(stream).toHaveBeenCalledTimes(1);
    expect(stream).toHaveBeenCalledWith(HISTORY, "Combien de commandes ?", SIGNAL, CONTEXT, "fr", "note", IMAGES);
    expect(out.events).toStrictEqual(GEM_EVENTS);
    out.events.forEach((event, i) => expect(event).toBe(GEM_EVENTS[i]));
    expect(out.provider).toBe("gemini");
  });

  it("Groq first and fine: its result as events, Gemini never called", async () => {
    const groq = resolves(groqResult({ text: "fin", toolCalls: [CALL_A] }));
    const out = await drain(runChatTurnStream(turn(), fakes({ groq })));
    expect(groq).toHaveBeenCalledTimes(1);
    expect(groq).toHaveBeenCalledWith({ apiKey: KEY, history: HISTORY, userMessage: "Combien de commandes ?", locale: "fr", context: CONTEXT, shopContextNote: "note" });
    expect(out.events).toStrictEqual(groqToStreamEvents(groqResult({ text: "fin", toolCalls: [CALL_A] })));
    expect(out.provider).toBe("groq");
  });

  it("Groq error before any tool: its error is dropped and Gemini streams, each called once, Groq first", async () => {
    const groq = resolves(GROQ_FAIL);
    const stream = streams(GEM_EVENTS);
    const out = await drain(runChatTurnStream(turn(), fakes({ groq, stream })));
    expect(groq).toHaveBeenCalledTimes(1);
    expect(stream).toHaveBeenCalledTimes(1);
    expect(order(groq, stream)).toBe(true);
    expect(out.events).toStrictEqual(GEM_EVENTS);
    expect(out.provider).toBe("gemini");
  });

  it("Groq error AFTER a tool ran: no Gemini call, the tool events and the error are sent", async () => {
    const groq = resolves(groqResult({ toolCalls: [CALL_A], stopReason: "error", error: FAILURE }));
    const out = await drain(runChatTurnStream(turn(), fakes({ groq })));
    expect(out.events.map((e) => e.type)).toEqual(["tool_call", "tool_result", "error"]);
    expect(out.provider).toBe("groq");
  });

  it("Gemini error as its first event, then Groq answers: the error is dropped", async () => {
    const stream = streams([GEM_ERR]);
    const groq = resolves(GROQ_OK);
    const out = await drain(runChatTurnStream(turn({ order: GEMINI_ORDER }), fakes({ stream, groq })));
    expect(order(stream, groq)).toBe(true);
    expect(out.events).toStrictEqual(groqToStreamEvents(GROQ_OK));
    expect(out.provider).toBe("groq");
  });

  it("Gemini streamed a text_delta then errored: no fallback, no doubled answer", async () => {
    const events: AgentStreamEvent[] = [{ type: "text_delta", text: "début" }, GEM_ERR];
    const stream = streams(events);
    const out = await drain(runChatTurnStream(turn({ order: GEMINI_ORDER }), fakes({ stream })));
    expect(out.events).toStrictEqual(events);
    expect(out.provider).toBe("gemini");
  });

  it("Gemini ran a tool then errored: no fallback", async () => {
    const events: AgentStreamEvent[] = [{ type: "tool_call", name: "get_stock", args: {} }, GEM_ERR];
    const out = await drain(runChatTurnStream(turn({ order: GEMINI_ORDER }), fakes({ stream: streams(events) })));
    expect(out.events).toStrictEqual(events);
  });

  it("Gemini recorded a proposal then errored: no fallback", async () => {
    const events: AgentStreamEvent[] = [{ type: "action_proposal", proposal: PROPOSAL }, GEM_ERR];
    const out = await drain(runChatTurnStream(turn({ order: GEMINI_ORDER }), fakes({ stream: streams(events) })));
    expect(out.events).toStrictEqual(events);
  });

  it("both fail (Groq first): the LAST error is sent and Groq is not called again", async () => {
    const groq = resolves(GROQ_FAIL);
    const stream = streams([GEM_ERR]);
    const out = await drain(runChatTurnStream(turn(), fakes({ groq, stream })));
    expect(groq).toHaveBeenCalledTimes(1);
    expect(stream).toHaveBeenCalledTimes(1);
    expect(out.events).toStrictEqual([GEM_ERR]);
    expect(out.provider).toBe("gemini");
  });

  it("both fail (Gemini first): Groq's error is the one sent, Gemini is called once", async () => {
    const stream = streams([GEM_ERR]);
    const groq = resolves(GROQ_FAIL);
    const out = await drain(runChatTurnStream(turn({ order: GEMINI_ORDER }), fakes({ stream, groq })));
    expect(stream).toHaveBeenCalledTimes(1);
    expect(out.events).toStrictEqual([{ type: "error", message: "Limite atteinte.", code: "GROQ_RATE_LIMITED" }]);
    expect(out.provider).toBe("groq");
  });

  it("a proposal ends the turn on the Groq path", async () => {
    const groq = resolves(groqResult({ text: "Proposition enregistrée.", toolCalls: [CALL_A], stopReason: "proposal", actionProposal: PROPOSAL }));
    const out = await drain(runChatTurnStream(turn(), fakes({ groq })));
    expect(out.events.map((e) => e.type)).toEqual(["tool_call", "tool_result", "action_proposal", "text_delta", "done"]);
  });

  it("images: Gemini only, with the images, Groq never called", async () => {
    const stream = streams(GEM_EVENTS);
    const out = await drain(runChatTurnStream(turn({ images: IMAGES }), fakes({ stream })));
    expect(out.provider).toBe("gemini");
    expect(stream).toHaveBeenCalledWith(HISTORY, "Combien de commandes ?", SIGNAL, CONTEXT, "fr", "note", IMAGES);
  });

  it("no key / images need Gemini: one error event with its code, provider null, nothing called", async () => {
    const noKey = await drain(runChatTurnStream(turn({ locale: "en", geminiConfigured: false, groqApiKey: "" }), fakes({})));
    expect(noKey.events).toStrictEqual([{ type: "error", message: "No AI is set up. Add a key in Settings → Artificial intelligence.", code: "AI_KEY_MISSING" }]);
    expect(noKey.provider).toBeNull();
    const imgs = await drain(runChatTurnStream(turn({ locale: "ar", geminiConfigured: false, images: IMAGES }), fakes({})));
    expect(imgs.events).toStrictEqual([{ type: "error", message: "الصور يقرؤها Gemini فقط. أضف مفتاح Gemini أو أرسل الرسالة بدون صورة.", code: "AI_IMAGES_NEED_GEMINI" }]);
    expect(imgs.provider).toBeNull();
  });

  it("abort before the first provider starts: nothing is called, nothing is sent", async () => {
    const ac = new AbortController();
    ac.abort();
    const out = await drain(runChatTurnStream(turn({ signal: ac.signal }), fakes({})));
    expect(out).toEqual({ events: [], provider: null });
  });

  it("abort while Gemini fails first: Groq is not started and the held error is sent", async () => {
    const ac = new AbortController();
    const stream = vi.fn(() =>
      (async function* () {
        ac.abort();
        yield GEM_ERR;
      })(),
    );
    const out = await drain(runChatTurnStream(turn({ order: GEMINI_ORDER, signal: ac.signal }), fakes({ stream })));
    expect(out.events).toStrictEqual([GEM_ERR]);
    expect(out.provider).toBe("gemini");
  });
});
