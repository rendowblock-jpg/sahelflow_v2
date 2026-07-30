import { beforeAll, describe, expect, it } from "vitest";

import type { ToolContext } from "../registry";
import { getTool } from "../registry";

beforeAll(async () => {
  await import("../core-tools");
});

describe("AI confirmation authority", () => {
  it("does not accept confirmed as an update_order_status target", async () => {
    const tool = getTool("update_order_status");
    expect(tool).toBeDefined();

    const result = await tool!.execute(
      { orderId: "order-ai-denied", status: "confirmed" },
      { db: {}, shop: {} as never } satisfies ToolContext,
    );

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/invalid|enum|confirmed/i);
    expect(tool!.definition.description).toMatch(/not available to ai|manual trusted approval/i);
  });
});
