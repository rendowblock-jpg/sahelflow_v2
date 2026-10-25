import { beforeEach, describe, expect, it, vi } from "vitest";

// The third provider: the seller's ChatGPT plan. The three readers are stand-ins; the clock and ledger are ours.
const h = vi.hoisted(() => ({ groq: vi.fn(), gemini: vi.fn(), openai: vi.fn() }));
vi.mock("../groq-extractor", () => ({ extractWithGroq: h.groq }));
vi.mock("../gemini-extractor", () => ({ extractWithGemini: h.gemini }));
vi.mock("../openai-extractor", () => ({ extractWithOpenAiPlan: h.openai }));

import { extractOrder } from "../smart-router";
import { createQuotaLedger } from "../../providers/quota-ledger";
import { OpenAiProviderError } from "../../providers/openai-chatgpt/errors";
import type { ExtractionResult } from "../types";

const NOW = new Date(2026, 9, 25, 10, 0, 0);
const input = { body: "salam, nheb nchri haja" };
const fail = (code: string, retryAfterSeconds?: number): ExtractionResult => ({
  order: null, method: "none", confidence: 0, isComplete: false, missingFields: [code], ...(retryAfterSeconds ? { raw: { retryAfterSeconds } } : {}),
});
const good = (method: "groq" | "gemini" | "openai"): ExtractionResult => ({
  order: { items: [{ name: "Robe", quantity: 1 }], phone: "0555123456", wilaya: "Alger" } as never, method, confidence: 0.9, isComplete: true,
});
const openai = { accessToken: async () => "tok-fake-123456", model: "gpt-fake" };
const run = (extra: Record<string, unknown> = {}, ledger = createQuotaLedger(() => NOW)) =>
  extractOrder(input, { forceGemini: true, now: () => NOW, ledger, ...extra });

beforeEach(() => { for (const f of Object.values(h)) f.mockReset(); });

describe("ChatGPT plan as a provider", () => {
  it("a seller with ONLY a ChatGPT sign-in is read by it", async () => {
    h.openai.mockResolvedValue(good("openai"));
    const result = await run({ openai });
    expect(result.method).toBe("openai");
    expect(h.groq).not.toHaveBeenCalled();
    expect(h.gemini).not.toHaveBeenCalled();
  });
  it("is not asked without an active plan-enabled account", async () => {
    h.groq.mockResolvedValue(fail("GROQ_PROVIDER_UNAVAILABLE"));
    const result = await run({ groqApiKey: "gsk_fake" });
    expect(h.openai).not.toHaveBeenCalled();
    expect(result.aiFailure).toBe("GROQ_PROVIDER_UNAVAILABLE");
  });
  it("default order is groq, gemini, openai", async () => {
    const calls: string[] = [];
    h.groq.mockImplementation(async () => { calls.push("groq"); return fail("GROQ_PROVIDER_UNAVAILABLE"); });
    h.gemini.mockImplementation(async () => { calls.push("gemini"); return fail("GEMINI_PROVIDER_UNAVAILABLE"); });
    h.openai.mockImplementation(async () => { calls.push("openai"); return good("openai"); });
    expect((await run({ groqApiKey: "g", geminiApiKey: "k", openai })).method).toBe("openai");
    expect(calls).toEqual(["groq", "gemini", "openai"]);
  });
  it("an explicit order puts ChatGPT first", async () => {
    h.openai.mockResolvedValue(good("openai"));
    await run({ groqApiKey: "g", openai, providerOrder: ["openai", "groq"] });
    expect(h.groq).not.toHaveBeenCalled();
  });
  it("quota: paused as retryAtKnown=false, aiRetryAt omitted, and not asked again", async () => {
    const ledger = createQuotaLedger(() => NOW);
    h.openai.mockResolvedValue(fail("OPENAI_QUOTA_EXHAUSTED", 120));
    const first = await run({ openai }, ledger);
    expect(first.aiFailure).toBe("OPENAI_QUOTA_EXHAUSTED");
    expect(first).not.toHaveProperty("aiRetryAt");
    expect(ledger.isPaused("openai", NOW)).toMatchObject({ paused: true, retryAtKnown: false });
    const second = await run({ openai }, ledger);
    expect(h.openai).toHaveBeenCalledTimes(1);
    expect(second.aiFailure).toBe("OPENAI_QUOTA_EXHAUSTED");
    expect(second).not.toHaveProperty("aiRetryAt");
  });
  it.each(["OPENAI_PLAN_NOT_ELIGIBLE", "OPENAI_SESSION_REVOKED"])("%s: paused for the rest of the day, keeps its own code, no time", async (code) => {
    const ledger = createQuotaLedger(() => NOW);
    h.openai.mockResolvedValue(fail(code));
    const first = await run({ openai }, ledger);
    expect(first.aiFailure).toBe(code);
    expect(first).not.toHaveProperty("aiRetryAt");
    const pause = ledger.isPaused("openai", NOW);
    expect(pause).toMatchObject({ paused: true, retryAtKnown: false, reason: code });
    expect(pause.until?.getTime()).toBe(new Date(2026, 9, 26, 0, 0, 0).getTime());
    expect((await run({ openai }, ledger)).aiFailure).toBe(code);
    expect(h.openai).toHaveBeenCalledTimes(1);
    expect(ledger.isPaused("openai", new Date(2026, 9, 26, 0, 0, 1)).paused).toBe(false);
  });
  it("a token failure is a coded failure, not a crash", async () => {
    const result = await run({ openai: { model: "m", accessToken: async () => { throw new OpenAiProviderError("OPENAI_SESSION_REVOKED", "gone"); } } });
    expect(result.aiFailure).toBe("OPENAI_SESSION_REVOKED");
    expect(h.openai).not.toHaveBeenCalled();
  });
  it("when Groq has a known time and ChatGPT has none, only Groq's time is offered", async () => {
    h.groq.mockResolvedValue(fail("GROQ_QUOTA_EXHAUSTED", 60));
    h.openai.mockResolvedValue(fail("OPENAI_QUOTA_EXHAUSTED"));
    const result = await run({ groqApiKey: "g", openai });
    expect(result.aiRetryAt).toBe(new Date(NOW.getTime() + 60_000).toISOString());
  });
});
