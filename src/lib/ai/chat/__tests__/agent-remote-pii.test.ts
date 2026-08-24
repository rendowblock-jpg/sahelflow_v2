import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/secrets", () => ({
  getSecret: vi
    .fn<(_context: unknown, key: string) => Promise<string | null>>()
    .mockResolvedValue(null),
}));

vi.mock("@/lib/db", () => ({
  db: {},
  shopContext: {
    shopId: "test",
    registryRevision: 1,
    databaseFileId: "test.db",
    migrationSetSha256: "0".repeat(64),
  },
}));

vi.mock("../tools/registry", () => ({
  getAllToolDefinitions: vi.fn<() => unknown[]>().mockReturnValue([]),
  getTool: vi.fn<(name: string) => unknown>().mockReturnValue(undefined),
  registerTool: vi.fn(),
  listTools: vi.fn().mockReturnValue([]),
}));

vi.mock("../tools/core-tools", () => ({}));
vi.mock("../tools/extended-tools", () => ({}));
vi.mock("../tools/advanced-tools", () => ({}));

import {
  runAgent,
  runAgentStream,
  type AgentMessage,
  type AgentStreamEvent,
} from "../agent";
import { getSecret } from "@/lib/secrets";
import { getTool } from "../tools/registry";
import type { ChatTool } from "../tools/registry";

const FULL_NAME = "Karim Benali";
const PHONE = "0555123456";
const STREET = "12 Rue Didouche Mourad, Alger Centre";

function geminiJsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function geminiTextResponse(text: string): Response {
  return geminiJsonResponse({
    candidates: [{ content: { parts: [{ text }] } }],
  });
}

function geminiFunctionCallResponse(
  name: string,
  args: Record<string, unknown>,
): Response {
  return geminiJsonResponse({
    candidates: [{ content: { parts: [{ functionCall: { name, args } }] } }],
  });
}

function sseResponse(chunks: object[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`),
        );
      }
      controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

function mockTool(name: string, data: unknown): ChatTool {
  return {
    definition: {
      name,
      description: "",
      parameters: { type: "object", properties: {} },
    },
    execute: vi.fn().mockResolvedValue({ success: true, data }),
  };
}

function requestBodyText(callIndex: number): string {
  const call = vi.mocked(fetch).mock.calls[callIndex];
  const init = call?.[1] as RequestInit | undefined;
  return String(init?.body ?? "");
}

async function collectStream(
  history: AgentMessage[],
  message: string,
): Promise<AgentStreamEvent[]> {
  const events: AgentStreamEvent[] = [];
  for await (const event of runAgentStream(history, message)) {
    events.push(event);
  }
  return events;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSecret).mockResolvedValue("test-key");
  vi.mocked(getTool).mockReturnValue(undefined);
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("agent remote-model PII boundary", () => {
  it("sanitizes replayed tool history with the tool name while preserving product names", async () => {
    const history: AgentMessage[] = [
      {
        role: "assistant",
        content: "",
        toolCalls: [
          {
            name: "search_customers",
            args: { query: "Karim" },
            result: [
              {
                id: "cust-1",
                name: FULL_NAME,
                phone: PHONE,
                wilaya: "Alger",
                orderCount: 2,
                totalSpent: 15000,
                address: STREET,
              },
            ],
          },
          {
            name: "search_products",
            args: { query: "Atlas" },
            result: [
              { id: "p1", name: "Atlas Premium Hoodie", price: 9000 },
            ],
          },
        ],
      },
    ];

    vi.mocked(fetch).mockResolvedValue(geminiTextResponse("OK"));
    await runAgent(history, "Continue");

    const body = requestBodyText(0);
    expect(body).toContain("Karim B.");
    expect(body).not.toContain(FULL_NAME);
    expect(body).not.toContain(PHONE);
    expect(body).not.toContain(STREET);
    expect(body).toContain("Atlas Premium Hoodie");
  });

  it("sanitizes live non-stream tool responses sent back to Gemini but keeps the local result raw", async () => {
    const rawResult = {
      id: "order-1",
      orderNumber: "CMD-1",
      status: "confirmed",
      totalPrice: 12000,
      deliveryCost: 700,
      wilaya: "Alger",
      commune: "Alger Centre",
      phone: PHONE,
      notes: `Meet ${FULL_NAME} at ${STREET}`,
      source: "manual",
      createdAt: "2026-08-24T10:00:00.000Z",
      confirmedAt: null,
      shippedAt: null,
      deliveredAt: null,
      customer: { id: "cust-1", name: FULL_NAME, phone: PHONE },
      items: [
        {
          productName: "Atlas Premium Hoodie",
          quantity: 1,
          unitPrice: 12000,
          total: 12000,
        },
      ],
      delivery: null,
    };
    vi.mocked(getTool).mockReturnValue(
      mockTool("get_order_details", rawResult),
    );
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        geminiFunctionCallResponse("get_order_details", {
          orderNumber: "CMD-1",
        }),
      )
      .mockResolvedValueOnce(geminiTextResponse("Done"));

    const result = await runAgent([], "Order details");

    const remoteBody = requestBodyText(1);
    expect(remoteBody).toContain("Karim B.");
    expect(remoteBody).toContain("Atlas Premium Hoodie");
    expect(remoteBody).not.toContain(FULL_NAME);
    expect(remoteBody).not.toContain(PHONE);
    expect(remoteBody).not.toContain(STREET);
    expect(result.toolCalls[0]?.result).toEqual(rawResult);
  });

  it("uses the same field-aware policy for streaming live tool responses", async () => {
    const rawResult = [
      {
        orderNumber: "CMD-2",
        status: "shipped",
        totalPrice: 18000,
        wilaya: "Oran",
        createdAt: "2026-08-24T10:00:00.000Z",
        customerName: FULL_NAME,
        customerPhone: PHONE,
      },
    ];
    vi.mocked(getTool).mockReturnValue(mockTool("search_orders", rawResult));
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        sseResponse([
          {
            candidates: [
              {
                content: {
                  parts: [
                    {
                      functionCall: {
                        name: "search_orders",
                        args: { query: "Karim" },
                      },
                    },
                  ],
                },
              },
            ],
          },
        ]),
      )
      .mockResolvedValueOnce(
        sseResponse([
          { candidates: [{ content: { parts: [{ text: "Done" }] } }] },
        ]),
      );

    const events = await collectStream([], "Find order");

    const remoteBody = requestBodyText(1);
    expect(remoteBody).toContain("Karim B.");
    expect(remoteBody).not.toContain(FULL_NAME);
    expect(remoteBody).not.toContain(PHONE);
    const rawToolResult = events.find((event) => event.type === "tool_result");
    expect(rawToolResult).toMatchObject({
      type: "tool_result",
      name: "search_orders",
      result: rawResult,
    });
  });

  it("minimizes proposal history projection without weakening the original action authority", async () => {
    const rawProposal = {
      pending_action_proposal: true as const,
      tool: "create_customer",
      proposal: {
        id: "aip-123",
        toolName: "create_customer",
        status: "pending",
        proposalDigestPrefix: "abcdef123456",
        summary: {
          customerName: FULL_NAME,
          phoneLast4: "3456",
          wilaya: "Alger",
        },
        expiresAt: "2026-08-24T20:00:00.000Z",
        createdAt: "2026-08-24T19:00:00.000Z",
        executionState: null,
        lastErrorCode: null,
      },
      proposalDigest: "trusted-proposal-digest",
    };
    vi.mocked(getTool).mockReturnValue(
      mockTool("create_customer", rawProposal),
    );
    vi.mocked(fetch).mockResolvedValue(
      geminiFunctionCallResponse("create_customer", {
        name: FULL_NAME,
        phone: PHONE,
      }),
    );

    const result = await runAgent([], "Create customer");

    expect(result.actionProposal).toEqual(rawProposal);
    const projected = result.toolCalls[0]?.result as Record<string, unknown>;
    expect(projected.proposalDigest).toBeUndefined();
    const proposal = projected.proposal as Record<string, unknown>;
    const summary = proposal.summary as Record<string, unknown>;
    expect(proposal.id).toBe("aip-123");
    expect(proposal.proposalDigestPrefix).toBe("abcdef123456");
    expect(summary.customerName).toBe("Karim B.");
    expect(summary.phoneLast4).toBe("••56");
  });
});
