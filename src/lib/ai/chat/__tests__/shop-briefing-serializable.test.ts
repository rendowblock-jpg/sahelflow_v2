/**
 * The AI capabilities route serializes the shop briefing as JSON. SQLite
 * returns COUNT(*) from $queryRaw as a BigInt, which made the route answer
 * 500; every briefing count must be a plain number (or null).
 */
import { describe, expect, it, vi } from "vitest";

import { loadShopBriefing } from "@/lib/ai/chat/shop-context";

describe("shop briefing", () => {
  it("is JSON-serializable when the raw count arrives as a BigInt", async () => {
    const count = vi.fn().mockResolvedValue(2);
    const prisma = {
      order: { count },
      product: { count, fields: { lowStockThreshold: "lowStockThreshold" } },
      delivery: { count },
      $queryRaw: vi.fn().mockResolvedValue([{ count: BigInt(3) }]),
    };
    const briefing = await loadShopBriefing(prisma as never, { shopIncarnationId: "shop-1" } as never);
    expect(briefing.pendingProposals).toBe(3);
    expect(() => JSON.stringify(briefing)).not.toThrow();
  });
});
