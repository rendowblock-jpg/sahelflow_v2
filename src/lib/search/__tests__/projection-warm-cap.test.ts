import { beforeEach, describe, expect, it, vi } from "vitest";

const warn = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ db: {}, shopContext: { shopId: "test" } }));
vi.mock("@/lib/logger", () => ({ logger: { warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { drainDirtyRows } from "@/lib/search/local-search-projection";

/** S01b-06: the warm-up may stop at its cap, but never silently. */
describe("warm-up batch cap", () => {
  beforeEach(() => {
    warn.mockClear();
  });

  it("logs ONE search.projection.warm-capped line (family and batch count) when the cap ends the loop", async () => {
    const refresh = vi.fn(async () => false);
    await drainDirtyRows(refresh, 5, "customer");
    expect(refresh).toHaveBeenCalledTimes(5);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("search.projection.warm-capped", { family: "customer", batches: 5 });
  });

  it("stays quiet when the backlog is finished before the cap", async () => {
    let left = 3;
    const refresh = vi.fn(async () => {
      left -= 1;
      return left === 0;
    });
    await drainDirtyRows(refresh, 5, "order");
    expect(refresh).toHaveBeenCalledTimes(3);
    expect(warn).not.toHaveBeenCalled();
  });

  it("retries a failing batch three times and then throws instead of hiding it", async () => {
    const refresh = vi.fn(async (): Promise<boolean> => {
      throw new Error("P1008");
    });
    await expect(drainDirtyRows(refresh, 5, "order")).rejects.toThrow("P1008");
    expect(refresh).toHaveBeenCalledTimes(3);
  });
});
