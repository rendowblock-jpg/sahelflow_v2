import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {}, shopContext: { shopId: "test" } }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { drainDirtyRows } from "@/lib/search/local-search-projection";
import { addWarmCappedFamilies, resetWarmCapState, warmCappedFamilies } from "@/lib/search/warm-cap-state";

/** When the warm-up stops at its cap, a search must say so instead of looking complete. */
describe("warm-up cap is remembered until the backlog is finished", () => {
  beforeEach(() => resetWarmCapState());

  it("marks the family when the cap ends the loop, and clears it when a later warm-up finishes", async () => {
    await drainDirtyRows(async () => false, 3, "customer");
    expect(warmCappedFamilies()).toEqual(["customer"]);
    await drainDirtyRows(async () => true, 3, "customer");
    expect(warmCappedFamilies()).toEqual([]);
  });

  it("keeps customers and orders apart, and ignores a family it does not search", async () => {
    await drainDirtyRows(async () => false, 2, "order");
    await drainDirtyRows(async () => false, 2, "projection");
    expect(warmCappedFamilies()).toEqual(["order"]);
  });

  it("does not mark a family when a batch failed (that already throws)", async () => {
    await expect(
      drainDirtyRows(async (): Promise<boolean> => { throw new Error("P1008"); }, 2, "customer"),
    ).rejects.toThrow("P1008");
    expect(warmCappedFamilies()).toEqual([]);
  });

  it("adds a capped family to the degraded set only for a person who may search it", async () => {
    await drainDirtyRows(async () => false, 1, "customer");
    await drainDirtyRows(async () => false, 1, "order");
    const allowed = new Set<"customer" | "order" | "product">();
    addWarmCappedFamilies(allowed, { customer: true, order: false });
    expect([...allowed]).toEqual(["customer"]);
    const none = new Set<"customer" | "order" | "product">();
    addWarmCappedFamilies(none, { customer: false, order: false });
    expect(none.size).toBe(0);
  });

  it("is called by the universal search before it answers, with the same rights the families use", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/search/universal-search-server.ts"), "utf8");
    expect(source).toMatch(
      /addWarmCappedFamilies\(degraded, \{\s*customer: canCustomers && canReadContact,\s*order: canOrders && canOpenProtectedOperationalDetail,\s*\}\);\s*return \{\s*query,\s*results,\s*degradedFamilies: \[\.\.\.degraded\]/,
    );
  });
});
