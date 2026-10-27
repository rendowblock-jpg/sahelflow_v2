/**
 * Confirming an order through the agent must not surface as AI_INTERNAL_ERROR.
 * Status `confirmed` is the governed refusal. Any other tool-args ZodError is
 * a coded validation result on both the JSON and SSE routes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/server", () => ({
  requireAuth: vi.fn(async () => undefined),
  getCurrentUserKey: vi.fn(async () => "confirm-order-user"),
}));

vi.mock("@/lib/identity/trusted-actor", () => ({
  requireTrustedActor: vi.fn(async () => ({
    version: 1,
    actor: {
      kind: "compatibility_local_owner",
      role: "owner",
      sessionId: "confirm-order-session",
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

// Gemini only: the routes now also ask whether a Gemini key exists and look for a Groq key.
vi.mock("@/lib/secrets", () => ({
  hasSecret: vi.fn(async (_context: unknown, name: string) => name === "gemini_api_key"),
  getSecret: vi.fn(async (_context: unknown, name: string) =>
    name === "gemini_api_key" ? "test-key" : null,
  ),
}));

vi.mock("@/lib/ai/providers/quota-ledger-store", () => ({
  restoreQuotaLedger: vi.fn(async () => undefined),
  saveQuotaLedger: vi.fn(async () => undefined),
}));

vi.mock("@/lib/ai/gemini/runtime-preferences", () => ({
  loadGeminiRuntimePreferences: vi.fn(async () => ({
    model: "gemini-3.5-flash",
    thinkingLevel: "MINIMAL",
  })),
}));

vi.mock("@/lib/ai/chat/shop-context", () => ({
  aiShopContextNote: vi.fn(async () => ""),
}));

vi.mock("@/lib/ai/actions/service", () => ({
  createAiActionProposal: vi.fn(async () => {
    throw new Error("confirmation must not create a proposal");
  }),
}));

const harness = vi.hoisted(() => ({
  messages: [] as Array<Record<string, unknown>>,
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
        title: "Orders",
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      update: vi.fn(async () => undefined),
    },
    aiChatMessage: {
      findMany: vi.fn(async () => []),
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        const row = { id: `msg-${harness.messages.length + 1}`, ...args.data };
        harness.messages.push(row);
        return row;
      }),
    },
  },
}));

process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { AI_GOVERNED_CONFIRMATION_REFUSAL } from "@/lib/ai/actions/contracts";
import { NextRequest } from "next/server";
import { POST as postMessage } from "../route";
import { POST as postStream } from "../stream/route";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function functionCall(status: string, signature?: string): Response {
  return jsonResponse({
    candidates: [
      {
        content: {
          parts: [
            {
              functionCall: {
                name: "update_order_status",
                args: { orderId: "order-1", status },
              },
              ...(signature ? { thoughtSignature: signature } : {}),
            },
          ],
        },
      },
    ],
  });
}

function sse(chunks: object[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
      }
      controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

function sseFunctionCall(status: string, signature?: string): Response {
  return sse([
    {
      candidates: [
        {
          content: {
            parts: [
              {
                functionCall: {
                  name: "update_order_status",
                  args: { orderId: "order-1", status },
                },
                ...(signature ? { thoughtSignature: signature } : {}),
              },
            ],
          },
        },
      ],
    },
  ]);
}

function request(url: string): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "Confirme la commande", locale: "fr" }),
  });
}

function parseSse(text: string): Array<{ event: string; data: Record<string, unknown> }> {
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

beforeEach(() => {
  harness.messages.length = 0;
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("confirm-order with status confirmed does not 500", () => {
  it("returns the French refusal from the JSON route and keeps the tool name", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(functionCall("confirmed", "sig-confirm-keep"))
      .mockResolvedValueOnce(jsonResponse({
        candidates: [{ content: { parts: [{ text: "Confirmation refusée." }] } }],
      }));

    const response = await postMessage(request("http://localhost/api/ai/sessions/sess-1/messages"), {
      params: Promise.resolve({ id: "sess-1" }),
    });
    expect(response.status).not.toBe(500);
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      error: string | null;
      toolCalls: Array<{ name: string; result: { error?: string }; thoughtSignature?: string }>;
    };
    expect(body.error).toBeNull();
    expect(body.toolCalls[0]?.name).toBe("update_order_status");
    expect(body.toolCalls[0]?.result.error).toBe(AI_GOVERNED_CONFIRMATION_REFUSAL);
    expect(body.toolCalls[0]?.thoughtSignature).toBe("sig-confirm-keep");
    const stored = harness.messages.find((row) => row.role === "assistant");
    const persisted = JSON.parse(String(stored?.toolCalls)) as Array<{
      name: string;
      thoughtSignature: string;
    }>;
    expect(persisted[0]?.name).toBe("update_order_status");
    expect(persisted[0]?.thoughtSignature).toBe("sig-confirm-keep");
  });

  it("returns the French refusal on the stream and does not emit AI_INTERNAL_ERROR", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(sseFunctionCall("confirmed", "sig-stream-keep"))
      .mockResolvedValueOnce(
        sse([{ candidates: [{ content: { parts: [{ text: "Confirmation refusée." }] } }] }]),
      );

    const response = await postStream(
      request("http://localhost/api/ai/sessions/sess-1/messages/stream"),
      { params: Promise.resolve({ id: "sess-1" }) },
    );
    expect(response.status).toBe(200);
    const events = parseSse(await response.text());
    expect(events.some((event) => event.data.code === "AI_INTERNAL_ERROR")).toBe(false);
    const toolResult = events.find((event) => event.event === "tool_result");
    expect(toolResult?.data).toMatchObject({
      name: "update_order_status",
      result: { error: AI_GOVERNED_CONFIRMATION_REFUSAL },
    });
    const stored = harness.messages.find((row) => typeof row.toolCalls === "string");
    const persisted = JSON.parse(String(stored?.toolCalls)) as Array<{
      name: string;
      thoughtSignature: string;
    }>;
    expect(persisted[0]?.name).toBe("update_order_status");
    expect(persisted[0]?.thoughtSignature).toBe("sig-stream-keep");
  });

  it("maps an invalid tool status on the JSON route to validation, not 500", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(functionCall("nope"));
    const response = await postMessage(request("http://localhost/api/ai/sessions/sess-1/messages"), {
      params: Promise.resolve({ id: "sess-1" }),
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { code: string; error: string };
    expect(body.code).toBe("AI_TOOL_ARGUMENTS_INVALID");
    expect(body.error).toMatch(/^Invalid arguments —/);
  });
});
