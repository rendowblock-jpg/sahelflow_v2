import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AI_GOVERNED_CONFIRMATION_REFUSAL } from "@/lib/ai/actions/contracts";
import { runWithAiActionProposalRuntime } from "@/lib/ai/actions/proposal-runtime";
import "@/lib/ai/chat/tools/core-tools";
import { getTool } from "@/lib/ai/chat/tools/registry";
import { TEST_SHOP_CONTEXT } from "@/lib/data/__tests__/helpers";

const context = { db: {}, shop: TEST_SHOP_CONTEXT };

beforeEach(() => {
  process.env.SF_AI_ACTION_POLICY_TEST = "true";
});

afterEach(() => {
  delete process.env.SF_AI_ACTION_POLICY_TEST;
  vi.restoreAllMocks();
});

describe("confirm-order through the agent policy", () => {
  it("returns the French refusal for status confirmed and does not throw or propose", async () => {
    const createProposal = vi.fn();
    const definition = getTool("update_order_status")!.definition;
    const status = definition.parameters.properties.status as { enum?: string[] };
    expect(status.enum).toContain("confirmed");

    const result = await runWithAiActionProposalRuntime({ createProposal }, () =>
      getTool("update_order_status")!.execute(
        { orderId: "order-1", status: "confirmed" },
        context,
      ),
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe(AI_GOVERNED_CONFIRMATION_REFUSAL);
    expect(createProposal).not.toHaveBeenCalled();
  });
});
