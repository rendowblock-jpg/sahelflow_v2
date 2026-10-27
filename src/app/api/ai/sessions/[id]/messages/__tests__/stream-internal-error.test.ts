/**
 * SSE internal-error classification tests (audit S1-3).
 *
 * The stream route has already returned 200 when the agent runs, so
 * withErrorHandler cannot sanitize anything sent over SSE. These tests pin the
 * contract: the `error` event carries a stable coded payload — provider
 * failures keep their coded, locale-native Gemini copy; everything else is a
 * generic AI_INTERNAL_ERROR event whose `message` never contains raw internal
 * error text (Prisma/IPC/storage). `message` is the field the stream consumer
 * (src/hooks/use-ai-workspace.ts) reads.
 */
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("@/lib/auth/server", () => ({
  requireAuth: vi.fn(async () => undefined),
  getCurrentUserKey: vi.fn(async () => "stream-error-test-user"),
}));

vi.mock("@/lib/identity/trusted-actor", () => ({
  requireTrustedActor: vi.fn(async () => ({
    version: 1,
    actor: {
      kind: "compatibility_local_owner",
      role: "owner",
      sessionId: "stream-error-test-session",
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

vi.mock("@/lib/db", () => {
  const aiChatMessageRows: Array<Record<string, unknown>> = [];
  return {
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
        create: vi.fn(async (args: { data: Record<string, unknown> }) => {
          const row = {
            id: `msg-${aiChatMessageRows.length + 1}`,
            ...args.data,
          };
          aiChatMessageRows.push(row);
          return row;
        }),
      },
    },
  };
});

const agentHarness = vi.hoisted(() => ({
  thrown: null as unknown,
}));

vi.mock("@/lib/ai/chat/agent", () => ({
  runAgentStream: vi.fn(async function* () {
    if (agentHarness.thrown !== null) {
      throw agentHarness.thrown;
    }
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

import { GeminiProviderError, geminiErrorMessage } from "@/lib/ai/gemini/provider";
import { NextRequest } from "next/server";
import { POST } from "../stream/route";

function streamRequest(locale?: string): NextRequest {
  return new NextRequest(
    "http://localhost/api/ai/sessions/sess-1/messages/stream",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        locale ? { message: "Hello", locale } : { message: "Hello" },
      ),
    },
  );
}

type SseEvent = { event: string; data: Record<string, unknown> };

function parseSse(text: string): SseEvent[] {
  return text
    .split("\n\n")
    .filter((block) => block.trim().length > 0)
    .map((block) => {
      let event = "";
      let data = "{}";
      for (const line of block.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        if (line.startsWith("data:")) data = line.slice(5).trim();
      }
      return { event, data: JSON.parse(data) as Record<string, unknown> };
    });
}

describe("POST /api/ai/sessions/[id]/messages/stream — SSE error classification (audit S1-3)", () => {
  it("sends a generic coded AI_INTERNAL_ERROR event for non-provider throws", async () => {
    agentHarness.thrown = new Error(
      "PrismaClientKnownRequestError: SELECT failed on AiChatMessage (internal)",
    );
    try {
      const response = await POST(streamRequest(), {
        params: Promise.resolve({ id: "sess-1" }),
      });
      expect(response.status).toBe(200);

      const events = parseSse(await response.text());
      const errorEvents = events.filter((event) => event.event === "error");
      expect(errorEvents).toHaveLength(1);
      const failureEvent = errorEvents[0]!;
      expect(failureEvent.data).toMatchObject({
        code: "AI_INTERNAL_ERROR",
        message: "The AI assistant hit an internal error. Please try again.",
      });
      // Raw internal error text must never ride the SSE event.
      expect(JSON.stringify(failureEvent.data)).not.toContain("Prisma");
    } finally {
      agentHarness.thrown = null;
    }
  });

  it("keeps the coded, locale-native Gemini copy for provider errors", async () => {
    const providerError = new GeminiProviderError(
      "GEMINI_QUOTA_EXHAUSTED",
      "Resource exhausted",
      429,
      "RESOURCE_EXHAUSTED",
    );
    agentHarness.thrown = providerError;
    try {
      const response = await POST(streamRequest("en"), {
        params: Promise.resolve({ id: "sess-1" }),
      });
      expect(response.status).toBe(200);

      const events = parseSse(await response.text());
      const errorEvents = events.filter((event) => event.event === "error");
      expect(errorEvents).toHaveLength(1);
      const failureEvent = errorEvents[0]!;
      expect(failureEvent.data).toMatchObject({
        code: "GEMINI_QUOTA_EXHAUSTED",
        message: geminiErrorMessage(providerError, "en"),
      });
      // The provider's raw message text is not forwarded — only the copy.
      expect(JSON.stringify(failureEvent.data)).not.toContain(
        "Resource exhausted",
      );
    } finally {
      agentHarness.thrown = null;
    }
  });

  it("maps a tool-argument ZodError to a coded validation event, not AI_INTERNAL_ERROR", async () => {
    try {
      z.object({ status: z.enum(["draft"]) }).parse({ status: "confirmed" });
      throw new Error("expected ZodError");
    } catch (error) {
      if (!(error instanceof z.ZodError)) throw error;
      agentHarness.thrown = error;
    }
    try {
      const response = await POST(streamRequest(), {
        params: Promise.resolve({ id: "sess-1" }),
      });
      expect(response.status).not.toBe(500);
      const events = parseSse(await response.text());
      const errorEvents = events.filter((event) => event.event === "error");
      expect(errorEvents).toHaveLength(1);
      expect(errorEvents[0]!.data.code).toBe("AI_TOOL_ARGUMENTS_INVALID");
      expect(String(errorEvents[0]!.data.message)).toMatch(/^Invalid arguments —/);
      expect(JSON.stringify(errorEvents[0]!.data)).not.toContain("AI_INTERNAL_ERROR");
    } finally {
      agentHarness.thrown = null;
    }
  });
});
