/**
 * Rate limiter order on the chat stream route (audit AIX-07 / S06a-09).
 *
 * The limiter used to run before the request body was validated, so a
 * malformed request spent the seller's per-session and per-day message budget.
 * Validation (schema and attachments) now comes first; only a request that can
 * actually reach the model consumes budget.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  createMessage: vi.fn(),
}));

vi.mock("@/lib/auth/server", () => ({
  requireAuth: vi.fn(async () => undefined),
  getCurrentUserKey: vi.fn(async () => "limiter-order-user"),
}));

vi.mock("@/lib/identity/trusted-actor", () => ({
  requireTrustedActor: vi.fn(async () => ({
    version: 1,
    actor: {
      kind: "compatibility_local_owner",
      role: "owner",
      sessionId: "limiter-order-session",
      compatibilityOnly: true,
    },
    shop: {
      workspaceId: "a".repeat(32),
      installationId: "b".repeat(32),
      shopId: "test",
      shopIncarnationId: "c".repeat(32),
      registryRevision: 1,
      databaseFileId: "test.db",
      migrationSetSha256: "0".repeat(64),
    },
  })),
}));

vi.mock("@/lib/license/license-server", () => ({
  requireLicense: vi.fn(async () => undefined),
}));

vi.mock("@/lib/settings", () => ({
  getBool: vi.fn(async () => true),
  getSetting: vi.fn(async () => null),
  SETTING_KEYS: { geminiConsentAccepted: "gemini_consent_accepted" },
}));

// The route now reads key presence and the ledger before the turn (Gemini only here).
vi.mock("@/lib/secrets", () => ({
  hasSecret: vi.fn(async () => true),
  getSecret: vi.fn(async () => null),
}));

vi.mock("@/lib/ai/providers/quota-ledger-store", () => ({
  restoreQuotaLedger: vi.fn(async () => undefined),
  saveQuotaLedger: vi.fn(async () => undefined),
}));

vi.mock("@/lib/ai/rate-limit", () => ({
  checkRateLimit: harness.checkRateLimit,
}));

vi.mock("@/lib/db", () => ({
  shopContext: {
    workspaceId: "a".repeat(32),
    installationId: "b".repeat(32),
    shopId: "test",
    shopIncarnationId: "c".repeat(32),
    registryRevision: 1,
    databaseFileId: "test.db",
    migrationSetSha256: "0".repeat(64),
  },
  db: {
    aiChatSession: {
      findUnique: vi.fn(async () => ({
        id: "sess-1",
        title: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      update: vi.fn(async () => undefined),
    },
    aiChatMessage: {
      findMany: vi.fn(async () => []),
      create: harness.createMessage,
    },
  },
}));

vi.mock("@/lib/ai/chat/agent", () => ({
  runAgentStream: vi.fn(async function* () {
    // No events: the route only needs the limiter ordering here.
  }),
}));

vi.mock("@/lib/ai/actions/proposal-runtime", () => ({
  runWithAiActionProposalRuntime: vi.fn(
    async (_deps: unknown, fn: () => Promise<void>) => fn(),
  ),
}));

vi.mock("@/lib/ai/actions/service", () => ({
  createAiActionProposal: vi.fn(async () => undefined),
}));

process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { NextRequest } from "next/server";
import { POST } from "../stream/route";

function streamRequest(body: unknown): NextRequest {
  return new NextRequest(
    "http://localhost/api/ai/sessions/sess-1/messages/stream",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

const context = { params: Promise.resolve({ id: "sess-1" }) };

beforeEach(() => {
  harness.checkRateLimit.mockReset();
  harness.checkRateLimit.mockReturnValue({ allowed: true });
  harness.createMessage.mockReset();
  harness.createMessage.mockImplementation(
    async (args: { data: Record<string, unknown> }) => ({
      id: "msg-1",
      ...args.data,
    }),
  );
});

describe("POST /api/ai/sessions/[id]/messages/stream — limiter order", () => {
  it("does not spend rate-limit budget on a request that fails validation", async () => {
    const response = await POST(streamRequest({}), context);

    expect(response.status).toBe(400);
    expect(harness.checkRateLimit).not.toHaveBeenCalled();
    expect(harness.createMessage).not.toHaveBeenCalled();
  });

  it("does not spend rate-limit budget on a request with undecodable attachments", async () => {
    const response = await POST(
      streamRequest({
        message: "hello",
        attachments: [{ mediaType: "image/png", data: "AAAAAAAAAAAA" }],
      }),
      context,
    );

    expect(response.status).toBe(400);
    expect(harness.checkRateLimit).not.toHaveBeenCalled();
  });

  it("answers 429 and persists nothing when a valid request is over the limit", async () => {
    harness.checkRateLimit.mockReturnValue({
      allowed: false,
      reason: "Session rate limit exceeded (20/hour)",
      retryAfterMs: 1_000,
    });

    const response = await POST(streamRequest({ message: "hello" }), context);

    expect(response.status).toBe(429);
    expect(harness.checkRateLimit).toHaveBeenCalledTimes(1);
    expect(harness.createMessage).not.toHaveBeenCalled();
  });

  it("spends exactly one unit of budget on a valid request", async () => {
    const response = await POST(streamRequest({ message: "hello" }), context);

    expect(response.status).toBe(200);
    await response.text();
    expect(harness.checkRateLimit).toHaveBeenCalledTimes(1);
    expect(harness.checkRateLimit).toHaveBeenCalledWith(
      "sess-1",
      "limiter-order-user",
    );
  });
});
