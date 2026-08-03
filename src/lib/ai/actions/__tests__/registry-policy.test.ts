import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runWithAiActionProposalRuntime } from "../proposal-runtime";
import {
  getAllToolDefinitions,
  getTool,
  registerTool,
  type ChatTool,
  type ToolContext,
} from "@/lib/ai/chat/tools/registry";
import { TEST_SHOP_CONTEXT } from "@/lib/data/__tests__/helpers";

function tool(name: string, execute = vi.fn()): ChatTool {
  return {
    definition: {
      name,
      description: `${name} test tool`,
      parameters: { type: "object", properties: {} },
    },
    execute: execute.mockResolvedValue({ success: true, data: { mutated: true } }),
  };
}

const context: ToolContext = {
  db: {},
  shop: TEST_SHOP_CONTEXT,
};

beforeEach(() => {
  process.env.SF_AI_ACTION_POLICY_TEST = "true";
});

afterEach(() => {
  delete process.env.SF_AI_ACTION_POLICY_TEST;
  vi.restoreAllMocks();
});

describe("central AI tool execution policy", () => {
  it("requires a persisted proposal runtime for sensitive tools", async () => {
    const legacyMutation = vi.fn();
    registerTool(tool("create_product", legacyMutation));

    await expect(
      getTool("create_product")!.execute(
        { name: "Widget", price: 1000, stock: 1 },
        context,
      ),
    ).rejects.toMatchObject({ code: "AI_ACTION_PROPOSAL_RUNTIME_REQUIRED" });
    expect(legacyMutation).not.toHaveBeenCalled();
  });

  it("creates one exact proposal and never invokes the legacy mutation body", async () => {
    const legacyMutation = vi.fn();
    const createProposal = vi.fn(async (toolName: string) => ({
      proposal: {
        id: "aip_registry_test",
        toolName,
        status: "pending",
        proposalDigestPrefix: "123456789abc",
        summary: { kind: "product_create" },
        expiresAt: "2026-08-03T18:00:00.000Z",
        createdAt: "2026-08-03T17:50:00.000Z",
        executionState: null,
        lastErrorCode: null,
      },
      proposalDigest: "1".repeat(64),
    }));
    registerTool(tool("create_product", legacyMutation));

    const result = await runWithAiActionProposalRuntime(
      { createProposal },
      () =>
        getTool("create_product")!.execute(
          { name: "Widget", price: 1000, stock: 1 },
          context,
        ),
    );

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      pending_action_proposal: true,
      tool: "create_product",
      proposalDigest: "1".repeat(64),
    });
    expect(createProposal).toHaveBeenCalledTimes(1);
    expect(createProposal).toHaveBeenCalledWith(
      "create_product",
      expect.objectContaining({
        name: "Widget",
        price: 1000,
        stock: 1,
      }),
    );
    expect(legacyMutation).not.toHaveBeenCalled();
  });

  it("hides blocked provider actions and refuses their execution", async () => {
    const legacyProviderCall = vi.fn();
    registerTool(tool("assign_order_to_delivery", legacyProviderCall));

    expect(
      getAllToolDefinitions().some(
        (definition) => definition.name === "assign_order_to_delivery",
      ),
    ).toBe(false);
    await expect(
      getTool("assign_order_to_delivery")!.execute(
        { orderNumber: "ORD-1", provider: "yalidine" },
        context,
      ),
    ).rejects.toMatchObject({ code: "AI_PROVIDER_ACTION_NOT_CONVERGED" });
    expect(legacyProviderCall).not.toHaveBeenCalled();
  });

  it("fails closed when a tool is missing from central policy", () => {
    expect(() => registerTool(tool("unclassified_write_tool"))).toThrowError(
      /no central execution policy/i,
    );
  });
});
