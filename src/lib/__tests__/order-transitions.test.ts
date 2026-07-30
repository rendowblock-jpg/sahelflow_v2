import { describe, expect, it } from "vitest";
import {
  ACTIVE_ORDER_STATUSES,
  ORDER_STATUSES,
  TERMINAL_ORDER_STATUSES,
  canTransition,
  getAllowedTransitions,
  isTerminalStatus,
  triggersCustomerStatsReversal,
  triggersCustomerStatsUpdate,
  triggersStockDeduction,
  triggersStockRestoration,
} from "@/lib/order-transitions";
import type { OrderStatus } from "@/types/domain";

describe("ORDER_STATUSES", () => {
  it("has all 8 statuses", () => {
    expect(ORDER_STATUSES).toEqual([
      "draft", "pending", "confirmed", "shipped",
      "delivered", "returned", "refused", "cancelled",
    ]);
  });
});

describe("TERMINAL_ORDER_STATUSES", () => {
  it("keeps returned, refused and cancelled terminal", () => {
    expect(TERMINAL_ORDER_STATUSES).toEqual(["returned", "refused", "cancelled"]);
  });
});

describe("isTerminalStatus", () => {
  it("classifies terminal and active states", () => {
    for (const status of TERMINAL_ORDER_STATUSES) {
      expect(isTerminalStatus(status as OrderStatus)).toBe(true);
    }
    for (const status of ACTIVE_ORDER_STATUSES) {
      expect(isTerminalStatus(status as OrderStatus)).toBe(false);
    }
  });
});

describe("canTransition", () => {
  it("allows same-status no-ops", () => {
    for (const status of ORDER_STATUSES) {
      expect(canTransition(status as OrderStatus, status as OrderStatus)).toBe(true);
    }
  });

  it("blocks transitions out of terminal states", () => {
    for (const terminal of TERMINAL_ORDER_STATUSES) {
      for (const other of ORDER_STATUSES) {
        if (terminal === other) continue;
        expect(canTransition(terminal as OrderStatus, other as OrderStatus)).toBe(false);
      }
    }
  });

  it("allows draft intake and cancellation", () => {
    expect(canTransition("draft", "pending")).toBe(true);
    expect(canTransition("draft", "cancelled")).toBe(true);
    expect(canTransition("draft", "confirmed")).toBe(false);
  });

  it("reserves pending confirmation for the canonical command", () => {
    expect(canTransition("pending", "confirmed")).toBe(false);
    expect(canTransition("pending", "cancelled")).toBe(true);
    expect(canTransition("pending", "shipped")).toBe(false);
  });

  it("keeps downstream compatibility transitions", () => {
    expect(canTransition("confirmed", "shipped")).toBe(true);
    expect(canTransition("confirmed", "returned")).toBe(true);
    expect(canTransition("confirmed", "cancelled")).toBe(true);
    expect(canTransition("shipped", "delivered")).toBe(true);
    expect(canTransition("shipped", "returned")).toBe(true);
    expect(canTransition("shipped", "pending")).toBe(false);
    expect(canTransition("delivered", "shipped")).toBe(false);
  });
});

describe("getAllowedTransitions", () => {
  it("returns intake choices for draft and only rejection for pending", () => {
    expect(getAllowedTransitions("draft")).toEqual(["pending", "cancelled"]);
    expect(getAllowedTransitions("pending")).toEqual(["cancelled"]);
  });

  it("returns no transitions for terminal states", () => {
    for (const terminal of TERMINAL_ORDER_STATUSES) {
      expect(getAllowedTransitions(terminal as OrderStatus)).toEqual([]);
    }
  });
});

describe("stock authority", () => {
  it("never deducts stock through the compatibility transition helper", () => {
    expect(triggersStockDeduction("pending", "confirmed")).toBe(false);
    expect(triggersStockDeduction("confirmed", "confirmed")).toBe(false);
    expect(triggersStockDeduction("shipped", "delivered")).toBe(false);
  });

  it("retains compatibility restoration for existing downstream rows", () => {
    expect(triggersStockRestoration("confirmed", "returned")).toBe(true);
    expect(triggersStockRestoration("confirmed", "cancelled")).toBe(true);
    expect(triggersStockRestoration("shipped", "returned")).toBe(true);
    expect(triggersStockRestoration("delivered", "returned")).toBe(true);
    expect(triggersStockRestoration("delivered", "refused")).toBe(true);
    expect(triggersStockRestoration("draft", "cancelled")).toBe(false);
    expect(triggersStockRestoration("pending", "cancelled")).toBe(false);
  });
});

describe("customer statistics", () => {
  it("updates only on delivery", () => {
    expect(triggersCustomerStatsUpdate("shipped", "delivered")).toBe(true);
    expect(triggersCustomerStatsUpdate("delivered", "delivered")).toBe(false);
    expect(triggersCustomerStatsUpdate("confirmed", "shipped")).toBe(false);
  });

  it("reverses only delivered returns", () => {
    expect(triggersCustomerStatsReversal("delivered", "returned")).toBe(true);
    expect(triggersCustomerStatsReversal("delivered", "delivered")).toBe(false);
    expect(triggersCustomerStatsReversal("confirmed", "returned")).toBe(false);
    expect(triggersCustomerStatsReversal("shipped", "returned")).toBe(false);
    expect(triggersCustomerStatsReversal("shipped", "delivered")).toBe(false);
    expect(triggersCustomerStatsReversal("delivered", "cancelled")).toBe(false);
  });
});
