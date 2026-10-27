/**
 * The non-stream chat route asks runChatTurn which AI answers (Gemini, Groq or
 * both in the seller's order). Every provider call here is a mock; no network.
 * A Gemini-only shop must see exactly what the route sent before.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const GROQ_KEY = "gsk_TESTONLY_not_a_real_key_0123456789";
const h = vi.hoisted(() => ({
  calls: [] as string[],
  rows: [] as Array<Record<string, unknown>>,
  runAgent: vi.fn(),
  runGroq: vi.fn(),
  hasSecret: vi.fn(),
  getSecret: vi.fn(),
  getSetting: vi.fn(),
  getBool: vi.fn(),
  restore: vi.fn(),
  save: vi.fn(),
}));

vi.mock("@/lib/auth/server", () => ({
  requireAuth: vi.fn(async () => undefined),
  getCurrentUserKey: vi.fn(async () => "chat-provider-route-user"),
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
vi.mock("@/lib/ai/providers/quota-ledger-store", () => ({
  restoreQuotaLedger: h.restore,
  saveQuotaLedger: h.save,
}));
vi.mock("@/lib/ai/chat/agent", () => ({ runAgent: h.runAgent, runAgentStream: vi.fn() }));
vi.mock("@/lib/ai/chat/groq-agent", () => ({ runGroqAgent: h.runGroq }));
vi.mock("@/lib/ai/chat/shop-context", () => ({ aiShopContextNote: vi.fn(async () => "SHOP-NOTE") }));
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
import { POST } from "../route";

const NO_AI_FR = "Aucune IA n'est configurée. Ajoutez une clé dans Paramètres → Intelligence artificielle.";
const ctx = { params: Promise.resolve({ id: "sess-1" }) };
const post = () =>
  POST(
    new NextRequest("http://localhost/api/ai/sessions/sess-1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Combien de commandes ?", locale: "fr" }),
    }),
    ctx,
  );

function keys(opts: { gemini: boolean; groq: boolean; order?: string | null }) {
  h.hasSecret.mockImplementation(async (_c: unknown, name: string) => name === "gemini_api_key" && opts.gemini);
  h.getSecret.mockImplementation(async (_c: unknown, name: string) => (opts.groq && name === "groq_api_key" ? GROQ_KEY : null));
  h.getSetting.mockResolvedValue(opts.order ?? null);
}
const geminiAnswer = { response: "Gemini: 3 commandes", toolCalls: [{ name: "list_orders", args: {}, result: { n: 3 } }] };
const groqAnswer = (over: Record<string, unknown> = {}) => ({
  text: "Groq: 3 commandes", toolCalls: [{ name: "list_orders", args: {}, result: { n: 3 } }], rejectedCalls: [],
  actionProposals: [], usage: {}, estimatedTokens: 10, steps: 2, stopReason: "answered", ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  h.rows.length = 0;
  h.calls.length = 0;
  h.getBool.mockResolvedValue(true);
  h.restore.mockImplementation(async () => void h.calls.push("restore"));
  h.save.mockImplementation(async () => void h.calls.push("save"));
  h.runAgent.mockImplementation(async () => (h.calls.push("gemini"), geminiAnswer));
  h.runGroq.mockImplementation(async () => (h.calls.push("groq"), groqAnswer()));
  keys({ gemini: true, groq: false });
});

describe("POST /api/ai/sessions/[id]/messages with the provider choice", () => {
  it("Gemini only: runAgent gets the same arguments and the JSON is the one sent before", async () => {
    const res = await post();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ response: "Gemini: 3 commandes", toolCalls: geminiAnswer.toolCalls, error: null, persisted: true });
    expect(Object.keys(body).sort()).toEqual(["error", "persisted", "response", "toolCalls"]);
    expect(h.runAgent).toHaveBeenCalledTimes(1);
    const args = h.runAgent.mock.calls[0]!;
    expect(args[0]).toEqual([]);
    expect(args[1]).toBe("Combien de commandes ?");
    expect(args[2]).toMatchObject({ shop: { shopId: "test" }, sourceIdentity: "ai-session:sess-1" });
    expect(args.slice(3)).toEqual(["fr", "SHOP-NOTE"]);
    expect(h.runGroq).not.toHaveBeenCalled();
    expect(h.rows.map((r) => r.role)).toEqual(["user", "assistant"]);
    expect(h.rows[1]).toMatchObject({ sessionId: "sess-1", content: "Gemini: 3 commandes" });
    expect(JSON.parse(h.rows[1]!.toolCalls as string)).toEqual(geminiAnswer.toolCalls);
  });

  it("Gemini only with an error text: error is the string, nothing else is added, nothing is saved as an answer", async () => {
    h.runAgent.mockResolvedValue({ response: "", toolCalls: [], error: "Gemini est indisponible" });
    const body = await (await post()).json();
    expect(body).toEqual({ response: "", toolCalls: [], error: "Gemini est indisponible", persisted: false });
    expect(h.rows.map((r) => r.role)).toEqual(["user"]);
  });

  it("Groq only: the Groq loop answers and the row and the JSON have the same shape", async () => {
    keys({ gemini: false, groq: true });
    const res = await post();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ response: "Groq: 3 commandes", toolCalls: geminiAnswer.toolCalls, error: null, persisted: true });
    expect(Object.keys(body).sort()).toEqual(["error", "persisted", "response", "toolCalls"]);
    expect(h.runAgent).not.toHaveBeenCalled();
    expect(h.runGroq).toHaveBeenCalledTimes(1);
    expect(h.runGroq.mock.calls[0]![0]).toMatchObject({ apiKey: GROQ_KEY, userMessage: "Combien de commandes ?", locale: "fr", shopContextNote: "SHOP-NOTE" });
    expect(h.rows.map((r) => r.role)).toEqual(["user", "assistant"]);
    expect(Object.keys(h.rows[1]!).sort()).toEqual(Object.keys(h.rows[0]!).concat("toolCalls").sort());
    expect(h.rows[1]).toMatchObject({ role: "assistant", content: "Groq: 3 commandes" });
  });

  it("both keys: the default order lets Groq answer; gemini-first lets Gemini answer; an unreadable setting means the default", async () => {
    keys({ gemini: true, groq: true });
    expect((await (await post()).json()).response).toBe("Groq: 3 commandes");
    expect(h.runAgent).not.toHaveBeenCalled();
    keys({ gemini: true, groq: true, order: "gemini-first" });
    expect((await (await post()).json()).response).toBe("Gemini: 3 commandes");
    expect(h.runGroq).toHaveBeenCalledTimes(1);
    keys({ gemini: true, groq: true });
    h.getSetting.mockRejectedValue(new Error("settings unreadable"));
    expect((await (await post()).json()).response).toBe("Groq: 3 commandes");
  });

  it("Groq quota error before any tool: Gemini answers, one assistant row, the ledger is saved", async () => {
    keys({ gemini: true, groq: true });
    h.runGroq.mockImplementation(async () => (h.calls.push("groq"), groqAnswer({
      text: "", toolCalls: [], stopReason: "error", error: { code: "GROQ_QUOTA_EXHAUSTED", message: "limite atteinte" },
    })));
    const body = await (await post()).json();
    expect(body).toMatchObject({ response: "Gemini: 3 commandes", error: null, persisted: true });
    expect(h.calls).toEqual(["restore", "groq", "gemini", "save"]);
    expect(h.rows.filter((r) => r.role === "assistant")).toHaveLength(1);
  });

  it("no key at all: the fixed error with code AI_KEY_MISSING, no provider called, no assistant row", async () => {
    keys({ gemini: false, groq: false });
    const res = await post();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ response: "", toolCalls: [], error: NO_AI_FR, code: "AI_KEY_MISSING", persisted: false });
    expect(h.runAgent).not.toHaveBeenCalled();
    expect(h.runGroq).not.toHaveBeenCalled();
    expect(h.rows.map((r) => r.role)).toEqual(["user"]);
  });

  it("the ledger is restored before the turn and saved after it, also when the turn throws", async () => {
    await post();
    expect(h.calls).toEqual(["restore", "gemini", "save"]);
    h.calls.length = 0;
    h.runAgent.mockImplementation(async () => {
      throw z.object({ a: z.string() }).safeParse({}).error;
    });
    const bad = await post();
    expect(bad.status).toBe(400);
    expect((await bad.json()).code).toBe("AI_TOOL_ARGUMENTS_INVALID");
    expect(h.calls).toEqual(["restore", "save"]);
    h.calls.length = 0;
    h.runAgent.mockRejectedValue(new Error("boom"));
    expect((await post()).status).toBe(500);
    expect(h.calls).toEqual(["restore", "save"]);
  });

  it("without consent nothing about keys, settings or the ledger is read", async () => {
    h.getBool.mockResolvedValue(false);
    keys({ gemini: true, groq: true });
    const res = await post();
    expect(res.status).toBe(403);
    expect(h.hasSecret).not.toHaveBeenCalled();
    expect(h.getSecret).not.toHaveBeenCalled();
    expect(h.getSetting).not.toHaveBeenCalled();
    expect(h.restore).not.toHaveBeenCalled();
    expect(h.runAgent).not.toHaveBeenCalled();
    expect(h.runGroq).not.toHaveBeenCalled();
  });

  it("a key never reaches the response, a stored row or a log line", async () => {
    const spies = (["log", "info", "warn", "error"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => undefined));
    keys({ gemini: true, groq: true });
    const groqBody = JSON.stringify(await (await post()).json());
    keys({ gemini: true, groq: true, order: "gemini-first" });
    const geminiBody = JSON.stringify(await (await post()).json());
    expect(JSON.stringify(h.runAgent.mock.calls)).not.toContain(GROQ_KEY);
    for (const text of [groqBody, geminiBody, JSON.stringify(h.rows), JSON.stringify(spies.map((s) => s.mock.calls))]) {
      expect(text).not.toContain(GROQ_KEY);
      expect(text).not.toMatch(/gsk_/);
    }
    spies.forEach((s) => s.mockRestore());
  });
});
