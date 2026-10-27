/**
 * Stop: the route hands the AbortSignal it owns to runChatTurnStream, and that
 * signal turns aborted when the request aborts. The provider module is mocked.
 */
import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ seen: [] as Array<{ signal?: AbortSignal }> }));

vi.mock("@/lib/auth/server", () => ({
  requireAuth: vi.fn(async () => undefined),
  getCurrentUserKey: vi.fn(async () => "chat-provider-signal-user"),
}));
vi.mock("@/lib/identity/trusted-actor", () => ({
  requireTrustedActor: vi.fn(async () => ({ actor: { kind: "compatibility_local_owner", role: "owner" } })),
}));
vi.mock("@/lib/license/license-server", () => ({ requireLicense: vi.fn(async () => undefined) }));
vi.mock("@/lib/ai/rate-limit", () => ({ checkRateLimit: vi.fn(() => ({ allowed: true })) }));
vi.mock("@/lib/settings", () => ({
  getBool: vi.fn(async () => true),
  getSetting: vi.fn(async () => null),
  SETTING_KEYS: { geminiConsentAccepted: "gemini_consent_accepted" },
}));
vi.mock("@/lib/secrets", () => ({ hasSecret: vi.fn(async () => true), getSecret: vi.fn(async () => null) }));
vi.mock("@/lib/ai/providers/quota-ledger-store", () => ({
  restoreQuotaLedger: vi.fn(async () => undefined),
  saveQuotaLedger: vi.fn(async () => undefined),
}));
vi.mock("@/lib/ai/chat/chat-provider", () => ({
  runChatTurnStream: vi.fn(async function* (input: { signal?: AbortSignal }) {
    h.seen.push(input);
    await new Promise<void>((resolve) => {
      if (input.signal?.aborted) return resolve();
      input.signal?.addEventListener("abort", () => resolve(), { once: true });
      // A turn that never sees a signal would wait forever: end it so the test reports the real failure.
      if (!input.signal) setTimeout(resolve, 300);
    });
    return { provider: "groq" };
  }),
}));
vi.mock("@/lib/ai/chat/shop-context", () => ({ aiShopContextNote: vi.fn(async () => "") }));
vi.mock("@/lib/ai/actions/proposal-runtime", () => ({
  runWithAiActionProposalRuntime: vi.fn(async (_deps: unknown, fn: () => Promise<unknown>) => fn()),
}));
vi.mock("@/lib/ai/actions/service", () => ({ createAiActionProposal: vi.fn(async () => undefined) }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/monitoring/sentry", () => ({ captureError: vi.fn() }));
vi.mock("@/lib/db", () => ({
  shopContext: { shopId: "test" },
  db: {
    aiChatSession: { findUnique: vi.fn(async () => ({ id: "sess-1", title: null })), update: vi.fn(async () => undefined) },
    aiChatMessage: { findMany: vi.fn(async () => []), create: vi.fn(async ({ data }: { data: object }) => ({ id: "m1", ...data })) },
  },
}));

import { NextRequest } from "next/server";
import { POST } from "../stream/route";

describe("stream route passes the Stop signal to runChatTurnStream", () => {
  it("hands over an AbortSignal that becomes aborted when the request aborts", async () => {
    const stop = new AbortController();
    const request = new NextRequest("http://localhost/api/ai/sessions/sess-1/messages/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Bonjour", locale: "fr" }),
      signal: stop.signal,
    });
    const response = await POST(request, { params: Promise.resolve({ id: "sess-1" }) });
    await vi.waitFor(() => expect(h.seen).toHaveLength(1));
    const signal = h.seen[0]!.signal;
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal!.aborted).toBe(false);
    stop.abort();
    await vi.waitFor(() => expect(signal!.aborted).toBe(true));
    await response.text();
  });
});
