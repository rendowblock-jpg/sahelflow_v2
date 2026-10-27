import { describe, expect, it } from "vitest";

import { ALLOWED_TRANSITIONS, ORDER_STATUSES } from "@/lib/order-transitions";
import type { OrderStatus } from "@/types/domain";

import {
  BULK_CONFIRMATION_STATUSES,
  bulkNeedsConfirmation,
  ordersEmptyKind,
  readBulkOutcome,
} from "../bulk-result";

/**
 * P5 slice 1: what a seller must be told before and after a bulk status change on the orders list.
 * The rules here are derived from the lifecycle table, not typed in: if the lifecycle changes, these tests say so.
 */

function reachableFrom(start: OrderStatus): Set<OrderStatus> {
  const seen = new Set<OrderStatus>();
  const queue: OrderStatus[] = [start];
  while (queue.length > 0) {
    const current = queue.shift() as OrderStatus;
    for (const next of ALLOWED_TRANSITIONS[current]) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

describe("bulkNeedsConfirmation", () => {
  it("asks for the two actions the lifecycle cannot walk back, and only those the bulk bar offers", () => {
    expect([...BULK_CONFIRMATION_STATUSES].sort()).toEqual(["cancelled", "shipped"]);
    expect(bulkNeedsConfirmation("cancelled")).toBe(true);
    expect(bulkNeedsConfirmation("shipped")).toBe(true);
    expect(bulkNeedsConfirmation("confirmed")).toBe(false);
    expect(bulkNeedsConfirmation("pending")).toBe(false);
  });

  it("is grounded in the lifecycle: nothing that reaches cancelled or shipped can come back to pending or confirmed", () => {
    for (const target of BULK_CONFIRMATION_STATUSES) {
      const back = reachableFrom(target);
      expect(back.has("pending"), `${target} -> pending`).toBe(false);
      expect(back.has("confirmed"), `${target} -> confirmed`).toBe(false);
    }
  });

  it("does not ask for confirm, which a seller can still correct by cancelling", () => {
    expect(ALLOWED_TRANSITIONS.confirmed).toContain("cancelled");
    expect(bulkNeedsConfirmation("confirmed")).toBe(false);
  });

  it("a shipped order cannot be cancelled (so the ship dialog may say so)", () => {
    expect(ALLOWED_TRANSITIONS.shipped).not.toContain("cancelled");
    expect(ORDER_STATUSES).toContain("shipped");
  });
});

describe("readBulkOutcome", () => {
  const numbers = new Map([
    ["a", "ORD-0001"],
    ["b", "ORD-0002"],
    ["c", "ORD-0003"],
  ]);

  it("counts a clean success", () => {
    const outcome = readBulkOutcome({ succeeded: ["a", "b"], failed: [] }, numbers);
    expect(outcome).toEqual({ succeeded: 2, failed: [], failedIds: [] });
  });

  it("names each failed order with a reason taken from the stable code, never from the English text", () => {
    const outcome = readBulkOutcome(
      {
        succeeded: ["a"],
        failed: [
          { id: "b", error: "Cannot transition from 'cancelled' to 'shipped'. Allowed: (none)", code: "INVALID_TRANSITION" },
          { id: "c", error: "Order not found: c", code: "NOT_FOUND" },
          { id: "zz", error: "Order could not be updated", code: "ROW_UPDATE_FAILED" },
        ],
      },
      numbers,
    );
    expect(outcome?.succeeded).toBe(1);
    expect(outcome?.failedIds).toEqual(["b", "c", "zz"]);
    expect(outcome?.failed).toEqual([
      { id: "b", orderNumber: "ORD-0002", reason: "invalid_transition" },
      { id: "c", orderNumber: "ORD-0003", reason: "not_found" },
      { id: "zz", orderNumber: null, reason: "other" },
    ]);
    expect(JSON.stringify(outcome)).not.toContain("Cannot transition");
  });

  it("reads the old plain-id shape of a failure", () => {
    const outcome = readBulkOutcome({ succeeded: [], failed: ["a", "b"] }, numbers);
    expect(outcome?.failed.map((row) => [row.id, row.reason])).toEqual([
      ["a", "other"],
      ["b", "other"],
    ]);
  });

  it("lists a failed id once even if the server repeats it", () => {
    const outcome = readBulkOutcome({ succeeded: [], failed: [{ id: "a", code: "NOT_FOUND" }, { id: "a", code: "NOT_FOUND" }] }, numbers);
    expect(outcome?.failedIds).toEqual(["a"]);
  });

  it("returns null for an answer it cannot read, so the caller can say so instead of claiming success", () => {
    for (const bad of [null, undefined, "ok", 7, [], { succeeded: "a" }, { failed: {} }]) {
      expect(readBulkOutcome(bad, numbers), JSON.stringify(bad)).toBeNull();
    }
  });

  it("ignores a failure entry that has no usable id", () => {
    const outcome = readBulkOutcome({ succeeded: ["a"], failed: [{ code: "NOT_FOUND" }, null, 5, { id: "" }] }, numbers);
    expect(outcome).toEqual({ succeeded: 1, failed: [], failedIds: [] });
  });
});

describe("ordersEmptyKind", () => {
  it("separates a filtered view, an empty status tab and first use", () => {
    expect(ordersEmptyKind({ hasActiveFilters: true, statusFilter: "all" })).toBe("filtered");
    expect(ordersEmptyKind({ hasActiveFilters: true, statusFilter: "shipped" })).toBe("filtered");
    expect(ordersEmptyKind({ hasActiveFilters: false, statusFilter: "shipped" })).toBe("status");
    expect(ordersEmptyKind({ hasActiveFilters: false, statusFilter: "all" })).toBe("first-use");
    expect(ordersEmptyKind({ hasActiveFilters: false })).toBe("first-use");
  });
});
