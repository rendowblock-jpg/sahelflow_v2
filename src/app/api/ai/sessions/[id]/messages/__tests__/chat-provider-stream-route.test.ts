/**
 * The stream route asks runChatTurnStream which AI answers. Every provider call
 * is a mock; no network. A Gemini-only shop must see the events it saw before.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const GROQ_KEY = "gsk_TESTONLY_not_a_real_key_0123456789";
const h = vi.hoisted(() => ({
  calls: [] as string[],
  rows: [] as Array<Record<string, unknown>>,
  runAgentStream: vi.fn(),
  runGroq: vi.fn(),
  hasSecret: vi.fn(),
  getSecret: vi.fn(),
  getSetting: vi.fn(),
  getBool: vi.fn(),
  restore: vi.fn(),
  save: vi.fn(),
  decode: vi.fn(),
}));

vi.mock("@/lib/auth/server", () => ({
  requireAuth: vi.fn(async () => undefined),
  getCurrentUserKey: vi.fn(async () => "chat-provider-stream-user"),
}));
vi.mock("@/lib/identity/trusted-actor", () => ({
  requireTrustedActor: vi.fn(async () => ({ actor: { kind: "compatibility_local_owner", role: "owner" } })),
}));
vi.mock("@/lib/license/license-server", () => ({ requireLicense: vi.fn(async () => undefined) }));
vi.mock("@/lib/ai/rate-limit", () => ({ checkRateLimit: vi.fn(() => ({ allowed: true })) }));
vi.mock("@/lib/settings", () => ({
  getBool: h.getBool,
  getSetting: h.getSetting,
  SETTING_KEYS: { geminiConsentAccepted: "gemini_consent_accepted" },
}));
vi.mock("@/lib/secrets", () => ({ hasSecret: h.hasSecret, getSecret: h.getSecret }));
vi.mock("@/lib/ai/providers/quota-ledger-store", () => ({ restoreQuotaLedger: h.restore, saveQuotaLedger: h.save }));
vi.mock("@/lib/ai/chat/agent", () => ({ runAgent: vi.fn(), runAgentStream: h.runAgentStream }));
vi.mock("@/lib/ai/chat/groq-agent", () => ({ runGroqAgent: h.runGroq }));
vi.mock("@/lib/ai/chat/shop-context", () => ({ aiShopContextNote: vi.fn(async () => "SHOP-NOTE") }));
vi.mock("@/lib/ai/chat/attachments", async (orig) => {
  const { z } = await import("zod");
  return {
    ...(await orig<typeof import("@/lib/ai/chat/attachments")>()),
    aiChatAttachmentsInputSchema: z.array(z.unknown()).default([]),
    decodeAiChatImages: h.decode,
    storeAiChatAttachments: vi.fn(async () => []),
  };
});
vi.mock("@/lib/ai/actions/proposal-runtime", () => ({
  runWithAiActionProposalRuntime: vi.fn(async (_deps: unknown, fn: () => Promise<unknown>) => fn()),
}));
vi.mock("@/lib/ai/actions/service", () => ({ createAiActionProposal: vi.fn(async () => undefined) }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/monitoring/sentry", () => ({ captureError: vi.fn() }));
vi.mock("@/lib/db", () => ({
  shopContext: { shopId: "test" },
  db: {
    aiChatSession: {
      findUnique: vi.fn(async () => ({ id: "sess-1", title: null })),
      update: vi.fn(async () => undefined),
    },
    aiChatMessage: {
      findMany: vi.fn(async () => []),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        h.rows.push(data);
        return { id: `m${h.rows.length}`, ...data };
      }),
    },
  },
}));

import { NextRequest } from "next/server";
import { POST } from "../stream/route";

const NO_AI_FR = "Aucune IA n'est configurée. Ajoutez une clé dans Paramètres → Intelligence artificielle.";
const ctx = { params: Promise.resolve({ id: "sess-1" }) };
const call = { name: "list_orders", args: {}, result: { n: 3 } };

function req(over: Record<string, unknown> = {}, signal?: AbortSignal) {
  return new NextRequest("http://localhost/api/ai/sessions/sess-1/messages/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "Combien de commandes ?", locale: "fr", ...over }),
    ...(signal ? { signal } : {}),
  });
}
type Sse = { event: string; data: Record<string, unknown> };
async function run(request = req()): Promise<{ status: number; events: Sse[]; text: string }> {
  const res = await POST(request, ctx);
  const text = await res.text();
  const events = text.split("\n\n").filter((b) => b.trim()).map((b) => {
    const lines = b.split("\n");
    return {
      event: lines.find((l) => l.startsWith("event:"))!.slice(6).trim(),
      data: JSON.parse(lines.find((l) => l.startsWith("data:"))!.slice(5)) as Record<string, unknown>,
    };
  });
  return { status: res.status, events, text };
}
const names = (events: Sse[]) => events.map((e) => e.event);

function keys(opts: { gemini: boolean; groq: boolean; order?: string | null }) {
  h.hasSecret.mockImplementation(async (_c: unknown, name: string) => name === "gemini_api_key" && opts.gemini);
  h.getSecret.mockImplementation(async (_c: unknown, name: string) => (opts.groq && name === "groq_api_key" ? GROQ_KEY : null));
  h.getSetting.mockResolvedValue(opts.order ?? null);
}
function geminiEvents(events: unknown[]) {
  h.runAgentStream.mockImplementation(async function* () {
    h.calls.push("gemini");
    for (const e of events) yield e;
  });
}
const groqAnswer = (over: Record<string, unknown> = {}) => ({
  text: "Groq: 3 commandes", toolCalls: [call], rejectedCalls: [], actionProposals: [], usage: {},
  estimatedTokens: 10, steps: 2, stopReason: "answered", ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  h.rows.length = 0;
  h.calls.length = 0;
  h.getBool.mockResolvedValue(true);
  h.decode.mockReturnValue([]);
  h.restore.mockImplementation(async () => void h.calls.push("restore"));
  h.save.mockImplementation(async () => void h.calls.push("save"));
  h.runGroq.mockImplementation(async () => (h.calls.push("groq"), groqAnswer()));
  keys({ gemini: true, groq: false });
  geminiEvents([{ type: "text_delta", text: "Bon" }, { type: "text_delta", text: "jour" }, { type: "done", response: "Bonjour", toolCalls: [call] }]);
});

describe("POST /api/ai/sessions/[id]/messages/stream with the provider choice", () => {
  it("Gemini only: the same events in the same order, the same call, the same stored row", async () => {
    const { status, events } = await run();
    expect(status).toBe(200);
    expect(names(events)).toEqual(["user_persisted", "text_delta", "text_delta", "done", "close"]);
    expect(events[3]!.data).toEqual({ type: "done", response: "Bonjour", toolCalls: [call] });
    expect(h.runAgentStream).toHaveBeenCalledTimes(1);
    const args = h.runAgentStream.mock.calls[0]!;
    expect(args[0]).toEqual([]);
    expect(args[1]).toBe("Combien de commandes ?");
    expect(args[2]).toBeInstanceOf(AbortSignal);
    expect(args[3]).toMatchObject({ shop: { shopId: "test" }, sourceIdentity: "ai-session:sess-1" });
    expect(args.slice(4)).toEqual(["fr", "SHOP-NOTE", []]);
    expect(h.runGroq).not.toHaveBeenCalled();
    expect(h.rows.map((r) => r.role)).toEqual(["user", "assistant"]);
    expect(h.rows[1]).toMatchObject({ content: "Bonjour" });
    expect(JSON.parse(h.rows[1]!.toolCalls as string)).toEqual([call]);
  });

  it("Groq only: tool_call, tool_result, text_delta, done, and the assistant row", async () => {
    keys({ gemini: false, groq: true });
    const { events } = await run();
    expect(names(events)).toEqual(["user_persisted", "tool_call", "tool_result", "text_delta", "done", "close"]);
    expect(events[3]!.data).toEqual({ type: "text_delta", text: "Groq: 3 commandes" });
    expect(events[4]!.data).toEqual({ type: "done", response: "Groq: 3 commandes", toolCalls: [call] });
    expect(h.runAgentStream).not.toHaveBeenCalled();
    expect(h.runGroq.mock.calls[0]![0]).toMatchObject({ apiKey: GROQ_KEY, userMessage: "Combien de commandes ?", locale: "fr" });
    expect(h.rows.map((r) => r.role)).toEqual(["user", "assistant"]);
    expect(h.rows[1]).toMatchObject({ role: "assistant", content: "Groq: 3 commandes" });
    expect(JSON.parse(h.rows[1]!.toolCalls as string)).toEqual([call]);
  });

  it("an error event persists nothing, also after a streamed text (Gemini) or a tool and text (Groq)", async () => {
    geminiEvents([{ type: "text_delta", text: "partial" }, { type: "error", message: "limite", code: "GEMINI_QUOTA" }]);
    let out = await run();
    expect(names(out.events)).toEqual(["user_persisted", "text_delta", "error", "close"]);
    expect(h.rows.map((r) => r.role)).toEqual(["user"]);
    h.rows.length = 0;
    keys({ gemini: false, groq: true });
    h.runGroq.mockResolvedValue(groqAnswer({ text: "partial", stopReason: "error", error: { code: "GROQ_FAILED", message: "panne" } }));
    out = await run();
    expect(names(out.events)).toEqual(["user_persisted", "tool_call", "tool_result", "text_delta", "error", "close"]);
    expect(out.events[4]!.data).toMatchObject({ type: "error", message: "panne", code: "GROQ_FAILED" });
    expect(h.rows.map((r) => r.role)).toEqual(["user"]);
  });

  it("both keys: Groq first by default, Gemini first when chosen, and a Groq quota error falls back to Gemini with the ledger saved", async () => {
    keys({ gemini: true, groq: true });
    expect(names((await run()).events)).toContain("tool_call");
    expect(h.runAgentStream).not.toHaveBeenCalled();
    keys({ gemini: true, groq: true, order: "gemini-first" });
    expect(names((await run()).events)).toEqual(["user_persisted", "text_delta", "text_delta", "done", "close"]);
    h.calls.length = 0;
    keys({ gemini: true, groq: true });
    h.runGroq.mockImplementation(async () => (h.calls.push("groq"), groqAnswer({
      text: "", toolCalls: [], stopReason: "error", error: { code: "GROQ_QUOTA_EXHAUSTED", message: "limite atteinte" },
    })));
    const out = await run();
    expect(names(out.events)).toEqual(["user_persisted", "text_delta", "text_delta", "done", "close"]);
    expect(h.calls).toEqual(["restore", "groq", "gemini", "save"]);
  });

  it("no key at all: one coded error event with the fixed text, nothing called, nothing stored", async () => {
    keys({ gemini: false, groq: false });
    const { events } = await run();
    expect(names(events)).toEqual(["user_persisted", "error", "close"]);
    expect(events[1]!.data).toEqual({ type: "error", message: NO_AI_FR, code: "AI_KEY_MISSING" });
    expect(h.runAgentStream).not.toHaveBeenCalled();
    expect(h.runGroq).not.toHaveBeenCalled();
    expect(h.rows.map((r) => r.role)).toEqual(["user"]);
  });

  it("images with only a Groq key: the images-need-Gemini error; with a Gemini key the decoded images reach Gemini", async () => {
    const image = { mediaType: "image/png", bytes: Buffer.from("x"), width: 1, height: 1 };
    h.decode.mockReturnValue([image]);
    keys({ gemini: false, groq: true });
    const out = await run();
    expect(out.events[1]!.data).toMatchObject({ type: "error", code: "AI_IMAGES_NEED_GEMINI" });
    expect(h.runGroq).not.toHaveBeenCalled();
    expect(h.rows.map((r) => r.role)).toEqual(["user"]);
    keys({ gemini: true, groq: true });
    await run();
    expect(h.runGroq).not.toHaveBeenCalled();
    expect(h.runAgentStream.mock.calls[0]![6]).toEqual([image]);
  });

  it("a request aborted before the turn starts calls no model and stores no answer", async () => {
    keys({ gemini: true, groq: true });
    const out = await run(req({}, AbortSignal.abort()));
    expect(out.status).toBe(200);
    expect(h.runGroq).not.toHaveBeenCalled();
    expect(h.runAgentStream).not.toHaveBeenCalled();
    expect(h.rows.map((r) => r.role)).toEqual(["user"]);
  });

  it("the ledger is restored before the turn and saved after it, also when the turn throws", async () => {
    await run();
    expect(h.calls).toEqual(["restore", "gemini", "save"]);
    h.calls.length = 0;
    h.runAgentStream.mockImplementation(async function* () {
      throw new Error("boom");
    });
    const { events } = await run();
    expect(events.find((e) => e.event === "error")!.data).toMatchObject({ code: "AI_INTERNAL_ERROR" });
    expect(h.calls).toEqual(["restore", "save"]);
  });

  it("without consent nothing about keys, settings or the ledger is read", async () => {
    h.getBool.mockResolvedValue(false);
    keys({ gemini: true, groq: true });
    const res = await POST(req(), ctx);
    expect(res.status).toBe(403);
    expect(h.hasSecret).not.toHaveBeenCalled();
    expect(h.getSecret).not.toHaveBeenCalled();
    expect(h.getSetting).not.toHaveBeenCalled();
    expect(h.restore).not.toHaveBeenCalled();
    expect(h.runGroq).not.toHaveBeenCalled();
  });

  it("a key never reaches an event, a stored row or a log line", async () => {
    const spies = (["log", "info", "warn", "error"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => undefined));
    keys({ gemini: true, groq: true });
    const groqRun = await run();
    keys({ gemini: true, groq: true, order: "gemini-first" });
    const geminiRun = await run();
    expect(JSON.stringify(h.runAgentStream.mock.calls)).not.toContain(GROQ_KEY);
    for (const text of [groqRun.text, geminiRun.text, JSON.stringify(h.rows), JSON.stringify(spies.map((s) => s.mock.calls))]) {
      expect(text).not.toContain(GROQ_KEY);
      expect(text).not.toMatch(/gsk_/);
    }
    spies.forEach((s) => s.mockRestore());
  });
});
