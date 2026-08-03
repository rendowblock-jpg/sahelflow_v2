import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  execute: vi.fn(),
  getTool: vi.fn(),
}));

vi.mock("@/lib/secrets", () => ({
  getSecret: vi.fn(async () => "test-key"),
}));

vi.mock("@/lib/db", () => ({
  db: {},
  shopContext: {
    workspaceId: "a".repeat(32),
    installationId: "b".repeat(32),
    shopId: "test",
    shopIncarnationId: "c".repeat(32),
    registryRevision: 1,
    databaseFileId: "test.db",
    migrationSetSha256: "0".repeat(64),
  },
}));

vi.mock("../tools/registry", () => ({
  getAllToolDefinitions: vi.fn(() => [
    {
      name: "update_product_price",
      description: "",
      parameters: { type: "object", properties: {} },
    },
  ]),
  getTool: harness.getTool,
  registerTool: vi.fn(),
  listTools: vi.fn(() => []),
}));

vi.mock("../tools/core-tools", () => ({}));
vi.mock("../tools/extended-tools", () => ({}));
vi.mock("../tools/advanced-tools", () => ({}));

import { runAgent, runAgentStream, type AgentStreamEvent } from "../agent";

function proposalResult() {
  return {
    pending_action_proposal: true as const,
    tool: "update_product_price",
    proposal: {
      id: "aip_test",
      toolName: "update_product_price",
      status: "pending",
      proposalDigestPrefix: "123456789abc",
      summary: {
        kind: "product_price_update",
        productId: "product-1",
        currentPrice: 1000,
        newPrice: 1200,
      },
      expiresAt: "2026-08-03T18:00:00.000Z",
      createdAt: "2026-08-03T17:50:00.000Z",
      executionState: null,
      lastErrorCode: null,
    },
    proposalDigest: "1".repeat(64),
  };
}

function geminiFunctionCallResponse(): Response {
  return new Response(
    JSON.stringify({
      candidates: [
        {
          content: {
            parts: [
              {
                functionCall: {
                  name: "update_product_price",
                  args: { productId: "product-1", newPrice: 1200 },
                },
              },
            ],
          },
        },
      ],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function geminiFunctionCallStream(): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              candidates: [
                {
                  content: {
                    parts: [
                      {
                        functionCall: {
                          name: "update_product_price",
                          args: {
                            productId: "product-1",
                            newPrice: 1200,
                          },
                        },
                      },
                    ],
                  },
                },
              ],
            })}\n\n`,
          ),
        );
        controller.close();
      },
    }),
    { status: 200, headers: { "Content-Type": "text/event-stream" } },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  harness.execute.mockResolvedValue({
    success: true,
    data: proposalResult(),
  });
  harness.getTool.mockReturnValue({
    definition: {
      name: "update_product_price",
      description: "",
      parameters: { type: "object", properties: {} },
    },
    execute: harness.execute,
  });
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("proposal-bound agent contract", () => {
  it("stops the non-streaming loop after one durable proposal", async () => {
    vi.mocked(fetch).mockResolvedValue(geminiFunctionCallResponse());

    const result = await runAgent([], "Change the price");

    expect(result.actionProposal).toEqual(proposalResult());
    expect(result.toolCalls).toHaveLength(1);
    expect(JSON.stringify(result.toolCalls)).not.toContain("1".repeat(64));
    expect(result.response).toMatch(/proposition d'action exacte/i);
    expect(result.response).toMatch(/« oui » ne l'exécutera pas/i);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(harness.execute).toHaveBeenCalledTimes(1);
  });

  it("emits action_proposal and done without another streaming turn", async () => {
    vi.mocked(fetch).mockResolvedValue(geminiFunctionCallStream());
    const events: AgentStreamEvent[] = [];

    for await (const event of runAgentStream([], "Change the price")) {
      events.push(event);
    }

    expect(events.map((event) => event.type)).toEqual([
      "tool_call",
      "tool_result",
      "action_proposal",
      "done",
    ]);
    const proposal = events.find(
      (
        event,
      ): event is Extract<AgentStreamEvent, { type: "action_proposal" }> =>
        event.type === "action_proposal",
    );
    expect(proposal?.proposal).toEqual(proposalResult());
    const toolResult = events.find((event) => event.type === "tool_result");
    expect(JSON.stringify(toolResult)).not.toContain("1".repeat(64));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(harness.execute).toHaveBeenCalledTimes(1);
  });
});
