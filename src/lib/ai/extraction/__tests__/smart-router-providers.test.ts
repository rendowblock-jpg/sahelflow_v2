/**
 * Smart router with two AI providers and the quota ledger. Only global fetch
 * is mocked, so these tests prove what really goes out on the network.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({ logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/db", () => ({ db: {}, shopContext: {} }));
vi.mock("@/lib/ai/gemini/runtime-preferences", () => ({
  loadGeminiRuntimePreferences: vi.fn(async () => ({ model: "gemini-3.5-flash", thinkingLevel: "MINIMAL" })),
}));

import { extractOrder } from "../smart-router";
import { createQuotaLedger } from "../../providers/quota-ledger";

const GROQ_KEY = ["gsk", "_", "FakeFakeFakeFakeFakeFake1234567890"].join("");
const GEMINI_KEY = ["AI", "za", "SyFakeFakeFakeFakeFakeFake12345678"].join("");
const PARTIAL = "2x écouteurs JBL 9000 DA Alger"; // offline reading: not enough
const COMPLETE = "اسمي Ahmed، 2x iPhone 14 ب 8500 دج ف Alger، رقمي 0661234567";
const ORDER = { customerName: "Ahmed", phone: "0661234567", wilaya: "Alger", items: [{ productName: "JBL", quantity: 2 }] };
const NOW = new Date("2026-10-25T12:00:00.000Z");

const fetchSpy = vi.fn();
const isGroq = (url: unknown) => String(url).includes("api.groq.com");
const groqOk = () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(ORDER) } }] }), { status: 200 });
const groqQuota = (seconds: number) =>
  new Response(JSON.stringify({ error: { message: "limit" } }), { status: 429, headers: { "retry-after": String(seconds) } });
const geminiOk = () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(ORDER) }] } }] }), { status: 200 });
const geminiQuota = (delay?: string) =>
  new Response(JSON.stringify({ error: { status: "RESOURCE_EXHAUSTED", message: "Quota exceeded",
    details: delay ? [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: delay }] : [] } }), { status: 429 });

/** Route each fetch by host. */
function serve(groq: () => Response, gemini: () => Response) {
  fetchSpy.mockImplementation(async (url: unknown) => (isGroq(url) ? groq() : gemini()));
}
const hosts = () => fetchSpy.mock.calls.map(([url]) => (isGroq(url) ? "groq" : "gemini"));
const run = (message: string, options: Record<string, unknown>, ledger = createQuotaLedger(), at = NOW) =>
  extractOrder({ body: message }, { ledger, now: () => at, ...options } as never);

beforeEach(() => { fetchSpy.mockReset(); vi.stubGlobal("fetch", fetchSpy); });
afterEach(() => vi.unstubAllGlobals());

describe("provider routing", () => {
  it("asks Groq first when the seller has both keys", async () => {
    serve(groqOk, geminiOk);
    const result = await run(PARTIAL, { groqApiKey: GROQ_KEY, geminiApiKey: GEMINI_KEY });
    expect(result.method).toBe("groq");
    expect(hosts()).toEqual(["groq"]);
  });

  it("honours an explicit provider order", async () => {
    serve(groqOk, geminiOk);
    const result = await run(PARTIAL, { groqApiKey: GROQ_KEY, geminiApiKey: GEMINI_KEY, providerOrder: ["gemini", "groq"] });
    expect(result.method).toBe("gemini");
    expect(hosts()).toEqual(["gemini"]);
  });

  it("asks Gemini when Groq hits its quota, and pauses Groq", async () => {
    serve(() => groqQuota(30), geminiOk);
    const ledger = createQuotaLedger();
    const result = await run(PARTIAL, { groqApiKey: GROQ_KEY, geminiApiKey: GEMINI_KEY }, ledger);
    expect(result.method).toBe("gemini");
    expect(hosts()).toEqual(["groq", "gemini"]);
    expect(ledger.isPaused("groq", NOW).until?.getTime()).toBe(NOW.getTime() + 30_000);
    expect(ledger.requestsToday("groq", NOW)).toBe(1);
    expect(ledger.requestsToday("gemini", NOW)).toBe(1);
  });

  it("continues to Gemini after a bad Groq key, without pausing Groq", async () => {
    serve(() => new Response("{}", { status: 401 }), geminiOk);
    const ledger = createQuotaLedger();
    const result = await run(PARTIAL, { groqApiKey: GROQ_KEY, geminiApiKey: GEMINI_KEY }, ledger);
    expect(result.method).toBe("gemini");
    expect(ledger.isPaused("groq", NOW).paused).toBe(false);
  });

  it("keeps the first failure code and omits aiRetryAt when nothing was quota-paused", async () => {
    serve(() => new Response("{}", { status: 401 }), () => new Response("{}", { status: 403 }));
    const result = await run(PARTIAL, { groqApiKey: GROQ_KEY, geminiApiKey: GEMINI_KEY });
    expect(result.method).toBe("regex");
    expect(result.aiFailure).toBe("GROQ_KEY_INVALID");
    expect(result.aiRetryAt).toBeUndefined();
  });
});

describe("both providers out of quota", () => {
  it("returns the offline reading with the first failure and the earliest retry time", async () => {
    serve(() => groqQuota(120), () => geminiQuota("57173s"));
    const result = await run(PARTIAL, { groqApiKey: GROQ_KEY, geminiApiKey: GEMINI_KEY });
    expect(result.method).toBe("regex");
    expect(result.order).not.toBeNull();
    expect(result.aiFailure).toBe("GROQ_QUOTA_EXHAUSTED");
    expect(result.aiFailure).toMatch(/_QUOTA_EXHAUSTED$/);
    expect(result.aiRetryAt).toBe(new Date(NOW.getTime() + 120_000).toISOString());
  });

  it("makes NO network call while every keyed provider is paused", async () => {
    serve(() => groqQuota(120), () => geminiQuota("600s"));
    const ledger = createQuotaLedger();
    await run(PARTIAL, { groqApiKey: GROQ_KEY, geminiApiKey: GEMINI_KEY }, ledger);
    fetchSpy.mockClear();
    const later = new Date(NOW.getTime() + 60_000);
    const again = await run(PARTIAL, { groqApiKey: GROQ_KEY, geminiApiKey: GEMINI_KEY }, ledger, later);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(again.aiFailure).toBe("GROQ_QUOTA_EXHAUSTED");
    expect(again.aiRetryAt).toBe(new Date(NOW.getTime() + 120_000).toISOString());
  });

  it("asks again once the pause has expired", async () => {
    serve(() => groqQuota(120), geminiOk);
    const ledger = createQuotaLedger();
    await run(PARTIAL, { groqApiKey: GROQ_KEY }, ledger);
    fetchSpy.mockClear();
    serve(groqOk, geminiOk);
    const result = await run(PARTIAL, { groqApiKey: GROQ_KEY }, ledger, new Date(NOW.getTime() + 121_000));
    expect(result.method).toBe("groq");
    expect(hosts()).toEqual(["groq"]);
  });

  it("skips a paused Groq and still asks Gemini", async () => {
    serve(() => groqQuota(600), geminiOk);
    const ledger = createQuotaLedger();
    ledger.recordQuotaHit("groq", 600, NOW);
    const result = await run(PARTIAL, { groqApiKey: GROQ_KEY, geminiApiKey: GEMINI_KEY }, ledger);
    expect(result.method).toBe("gemini");
    expect(hosts()).toEqual(["gemini"]);
  });
});

describe("existing behaviour is kept", () => {
  it("a Gemini-only seller is served by Gemini exactly as before", async () => {
    serve(groqOk, geminiOk);
    const result = await run(PARTIAL, { geminiApiKey: GEMINI_KEY });
    expect(result.method).toBe("gemini");
    expect(hosts()).toEqual(["gemini"]);
  });

  it("a Gemini-only seller who is out of quota gets the offline reading and the Google delay", async () => {
    serve(groqOk, () => geminiQuota("900s"));
    const result = await run(PARTIAL, { geminiApiKey: GEMINI_KEY });
    expect(result.method).toBe("regex");
    expect(result.aiFailure).toBe("GEMINI_QUOTA_EXHAUSTED");
    expect(result.aiRetryAt).toBe(new Date(NOW.getTime() + 900_000).toISOString());
  });

  it("no key at all: the offline reading, no failure, no call", async () => {
    const result = await run(PARTIAL, {});
    expect(result.method).toBe("regex");
    expect(result.aiFailure).toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("a complete offline reading never calls anything, whatever keys exist", async () => {
    const result = await run(COMPLETE, { groqApiKey: GROQ_KEY, geminiApiKey: GEMINI_KEY });
    expect(result.method).toBe("regex");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
