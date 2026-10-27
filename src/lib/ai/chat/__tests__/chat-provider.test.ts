/**
 * Which AI answers a chat turn, in what order, and how a Groq result becomes
 * the shapes the chat routes already send. Every provider call here is a fake
 * passed through `deps`: nothing touches a network or a database.
 */
import { describe, expect, it } from "vitest";

import { createQuotaLedger, quotaLedger } from "@/lib/ai/providers/quota-ledger";
import { chooseChatProviders } from "../chat-provider";

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

// @@STEP2@@
