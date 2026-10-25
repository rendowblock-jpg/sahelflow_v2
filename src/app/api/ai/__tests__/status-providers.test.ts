import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ hasSecret: vi.fn(), getBool: vi.fn(), getSetting: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ requireAuth: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/db", () => ({ db: {}, shopContext: { shopId: "default" } }));
vi.mock("@/lib/secrets", () => ({ hasSecret: h.hasSecret }));
vi.mock("@/lib/settings", async (orig) => ({ ...(await orig<typeof import("@/lib/settings")>()), getBool: h.getBool, getSetting: h.getSetting }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/monitoring/sentry", () => ({ captureError: vi.fn() }));
vi.mock("@/lib/redact-pii", () => ({ redactError: (error: unknown) => error }));
vi.mock("@/lib/shops/authority", () => ({ assertProcessShopAuthority: vi.fn() }));
vi.mock("@/lib/license/license-authority", () => ({ requireLicenseEntitlement: vi.fn() }));

import { GET } from "@/app/api/ai/status/route";

function setup(opts: { consent: boolean; gemini: boolean; groq: boolean; order?: string | null }) {
  h.getBool.mockResolvedValue(opts.consent);
  h.getSetting.mockResolvedValue(opts.order ?? null);
  h.hasSecret.mockImplementation(async (_c: unknown, name: string) => (name === "gemini_api_key" ? opts.gemini : opts.groq));
}
const status = async () => (await GET()).json();
beforeEach(() => vi.clearAllMocks());

describe("GET /api/ai/status", () => {
  it("keeps the old fields and adds each provider's key presence and the order", async () => {
    setup({ consent: true, gemini: true, groq: true, order: "gemini-first" });
    expect(await status()).toEqual({
      provider: "gemini", consentAccepted: true, keyConfigured: true, ready: true, extractionReady: true,
      providers: { groq: { configured: true }, gemini: { configured: true } }, order: "gemini-first",
    });
  });

  it("a Groq key alone reads orders but does NOT make the chat assistant ready (it still needs Gemini)", async () => {
    setup({ consent: true, gemini: false, groq: true });
    expect(await status()).toMatchObject({ keyConfigured: false, ready: false, extractionReady: true, order: "groq-first", providers: { groq: { configured: true }, gemini: { configured: false } } });
  });

  it("no consent means nothing is ready, and no key means no extraction", async () => {
    setup({ consent: false, gemini: true, groq: true });
    expect(await status()).toMatchObject({ ready: false, extractionReady: false });
    setup({ consent: true, gemini: false, groq: false });
    expect(await status()).toMatchObject({ ready: false, extractionReady: false });
  });
});
