/** get_sales_by_wilaya: Algeria has 69 wilayas, so a limit of 69 must be accepted and 70 refused. */
import { describe, expect, it } from "vitest";

import "@/lib/ai/chat/tools/advanced-tools-legacy";
import { getTool, type ToolContext } from "../registry";

const ctx = { db: { order: { findMany: async () => [] } }, shop: { shopId: "test" } } as unknown as ToolContext;
const run = (limit: number) => {
  const tool = getTool("get_sales_by_wilaya");
  if (!tool) throw new Error("tool not registered");
  return tool.execute({ limit }, ctx);
};

describe("get_sales_by_wilaya limit", () => {
  it("accepts 69 (every wilaya) and refuses 70", async () => {
    expect((await run(69)).success).toBe(true);
    expect((await run(70)).success).toBe(false);
  });
  it("still accepts 1 and refuses 0", async () => {
    expect((await run(1)).success).toBe(true);
    expect((await run(0)).success).toBe(false);
  });
});
