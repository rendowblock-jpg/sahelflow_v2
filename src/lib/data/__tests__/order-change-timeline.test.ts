/**
 * Timeline ledger read tests — B7-5 error truth.
 *
 * A ledger read failure must surface as a coded error, never masquerade as
 * an order with "no history" (the pre-B7-5 outer catch collapsed every DB
 * failure into an empty timeline).
 */
import { describe, expect, it, vi } from "vitest";

import { getOrderTimeline } from "@/lib/data/order-change-service";

describe("getOrderTimeline error truth (B7-5)", () => {
  it("propagates ledger read failures as coded errors instead of an empty timeline", async () => {
    const findMany = vi.fn(async () => {
      throw new Error("disk I/O error");
    });
    const context = { prisma: { orderChange: { findMany } } as never };

    await expect(getOrderTimeline(context, "order-1")).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
    });
    expect(findMany).toHaveBeenCalledTimes(1);
  });
});
