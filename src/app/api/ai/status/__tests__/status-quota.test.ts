/** GET /api/ai/status also tells the notices how much of the free limit is used, and when a pause ends. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ rows: new Map<string, string>(), hasSecret: vi.fn(), getBool: vi.fn(), failSettings: { on: false } }));
vi.mock("@/lib/auth/server", () => ({ requireAuth: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/db", () => ({ db: {}, shopContext: { shopId: "default" } }));
vi.mock("@/lib/secrets", () => ({ hasSecret: h.hasSecret }));
vi.mock("@/lib/settings", async (orig) => ({
  ...(await orig<typeof import("@/lib/settings")>()),
  getBool: h.getBool,
  getSetting: vi.fn(async (_c: unknown, key: string) => {
    if (h.failSettings.on && (key.startsWith("ai_quota") || key.startsWith("ai_requests"))) throw new Error("locked");
    return h.rows.get(key) ?? null;
  }),
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/monitoring/sentry", () => ({ captureError: vi.fn() }));
vi.mock("@/lib/redact-pii", () => ({ redactError: (error: unknown) => error }));
vi.mock("@/lib/shops/authority", () => ({ assertProcessShopAuthority: vi.fn() }));
vi.mock("@/lib/license/license-authority", () => ({ requireLicenseEntitlement: vi.fn() }));

import { quotaLedger } from "@/lib/ai/providers/quota-ledger";
import { requestCountKey } from "@/lib/ai/providers/quota-pending";
import { GET } from "../route";

const status = async () => (await GET()).json();
function keys(gemini: boolean, groq: boolean) {
  h.getBool.mockResolvedValue(true);
  h.hasSecret.mockImplementation(async (_c: unknown, name: string) => (name === "gemini_api_key" ? gemini : groq));
}
beforeEach(() => {
  h.rows.clear();
  h.failSettings.on = false;
  quotaLedger.clear("gemini");
  quotaLedger.clear("groq");
});

describe("quota fields of GET /api/ai/status", () => {
  it("ok and the counted requests of today, with the old fields untouched", async () => {
    keys(true, true);
    h.rows.set(requestCountKey("gemini", new Date()), "7");
    const body = await status();
    expect(body.quota).toEqual({ kind: "ok" });
    expect(body.requestsToday).toEqual({ gemini: 7, groq: 0 });
    expect(body).toMatchObject({ provider: "gemini", ready: true, keyConfigured: true, order: "groq-first" });
  });

  it("low when a free Gemini key (a recent quota stop on record) used 16 of its 20", async () => {
    keys(true, false);
    h.rows.set("ai_quota_pause_until_gemini", new Date(Date.now() - 3_600_000).toISOString());
    h.rows.set(requestCountKey("gemini", new Date()), "16");
    expect((await status()).quota).toEqual({ kind: "low", provider: "gemini", left: 4 });
  });

  it("never low without a known limit, however many requests were counted", async () => {
    keys(true, false);
    h.rows.set(requestCountKey("gemini", new Date()), "500");
    expect((await status()).quota).toEqual({ kind: "ok" });
  });

  it("paused: the only key is paused until a time that is sent as an ISO string", async () => {
    keys(true, false);
    const until = quotaLedger.recordQuotaHit("gemini", 3600);
    expect((await status()).quota).toEqual({ kind: "paused", provider: "gemini", until: until.toISOString(), untilKnown: true });
  });

  it("all_paused: both keys paused gives the earliest time", async () => {
    keys(true, true);
    quotaLedger.recordQuotaHit("gemini", 3600);
    const early = quotaLedger.recordQuotaHit("groq", 60);
    expect((await status()).quota).toEqual({ kind: "all_paused", resumeAt: early.toISOString(), resumeKnown: true });
  });

  it("one paused and the other fine: ok, answered by the other", async () => {
    keys(true, true);
    quotaLedger.recordQuotaHit("gemini", 3600);
    expect((await status()).quota).toEqual({ kind: "ok", answeredBy: "groq", pausedProviders: ["gemini"] });
  });

  it("a broken settings store never breaks the status answer", async () => {
    keys(true, true);
    h.failSettings.on = true;
    const body = await status();
    expect(body).toMatchObject({ ready: true, keyConfigured: true });
    expect(body.requestsToday).toEqual({});
  });
});
