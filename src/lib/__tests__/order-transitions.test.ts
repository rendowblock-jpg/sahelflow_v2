import { describe, it, expect } from "vitest";
import {
  ORDER_STATUSES,
  TERMINAL_ORDER_STATUSES,
  ACTIVE_ORDER_STATUSES,
  isTerminalStatus,
  canTransition,
  getAllowedTransitions,
  triggersStockDeduction,
  triggersStockRestoration,
  triggersCustomerStatsUpdate,
} from "@/lib/order-transitions";
import type { OrderStatus } from "@/types/domain";

describe("ORDER_STATUSES", () => {
  it("has all 8 statuses", () => {
    expect(ORDER_STATUSES).toHaveLength(8);
    expect(ORDER_STATUSES).toEqual([
      "draft", "pending", "confirmed", "shipped",
      "delivered", "returned", "refused", "cancelled",
    ]);
  });
});

describe("TERMINAL_ORDER_STATUSES", () => {
  it("has 4 terminal statuses", () => {
    expect(TERMINAL_ORDER_STATUSES).toHaveLength(4);
    expect(TERMINAL_ORDER_STATUSES).toEqual(["delivered", "returned", "refused", "cancelled"]);
  });
});

describe("isTerminalStatus", () => {
  it("returns true for terminal statuses", () => {
    for (const s of TERMINAL_ORDER_STATUSES) {
      expect(isTerminalStatus(s as OrderStatus)).toBe(true);
    }
  });

  it("returns false for active statuses", () => {
    for (const s of ACTIVE_ORDER_STATUSES) {
      expect(isTerminalStatus(s as OrderStatus)).toBe(false);
    }
  });
});

describe("canTransition", () => {
  it("allows same-status (no-op)", () => {
    for (const s of ORDER_STATUSES) {
      expect(canTransition(s as OrderStatus, s as OrderStatus)).toBe(true);
    }
  });

  it("blocks transitions OUT of terminal states", () => {
    for (const terminal of TERMINAL_ORDER_STATUSES) {
      for (const other of ORDER_STATUSES) {
        if (terminal === other) continue;
        expect(canTransition(terminal as OrderStatus, other as OrderStatus)).toBe(false);
      }
    }
  });

  it("allows draft → pending", () => {
    expect(canTransition("draft", "pending")).toBe(true);
  });

  it("allows draft → cancelled", () => {
    expect(canTransition("draft", "cancelled")).toBe(true);
  });

  it("blocks draft → confirmed (must go through pending)", () => {
    expect(canTransition("draft", "confirmed")).toBe(false);
  });

  it("allows pending → confirmed", () => {
    expect(canTransition("pending", "confirmed")).toBe(true);
  });

  it("allows pending → cancelled", () => {
    expect(canTransition("pending", "cancelled")).toBe(true);
  });

  it("blocks pending → shipped (must go through confirmed)", () => {
    expect(canTransition("pending", "shipped")).toBe(false);
  });

  it("allows confirmed → shipped", () => {
    expect(canTransition("confirmed", "shipped")).toBe(true);
  });

  it("allows confirmed → returned", () => {
    expect(canTransition("confirmed", "returned")).toBe(true);
  });

  it("allows confirmed → cancelled", () => {
    expect(canTransition("confirmed", "cancelled")).toBe(true);
  });

  it("allows shipped → delivered", () => {
    expect(canTransition("shipped", "delivered")).toBe(true);
  });

  it("allows shipped → returned", () => {
    expect(canTransition("shipped", "returned")).toBe(true);
  });

  it("blocks shipped → pending (no backwards)", () => {
    expect(canTransition("shipped", "pending")).toBe(false);
  });

  it("blocks delivered → shipped (terminal)", () => {
    expect(canTransition("delivered", "shipped")).toBe(false);
  });
});

describe("getAllowedTransitions", () => {
  it("returns allowed transitions for draft", () => {
    const allowed = getAllowedTransitions("draft");
    expect(allowed).toContain("pending");
    expect(allowed).toContain("cancelled");
    expect(allowed).not.toContain("draft");
  });

  it("returns empty array for terminal states", () => {
    for (const terminal of TERMINAL_ORDER_STATUSES) {
      expect(getAllowedTransitions(terminal as OrderStatus)).toEqual([]);
    }
  });
});

describe("triggersStockDeduction", () => {
  it("returns true for pending → confirmed", () => {
    expect(triggersStockDeduction("pending", "confirmed")).toBe(true);
  });

  it("returns false for confirmed → confirmed (same status)", () => {
    expect(triggersStockDeduction("confirmed", "confirmed")).toBe(false);
  });

  it("returns false for shipped → delivered", () => {
    expect(triggersStockDeduction("shipped", "delivered")).toBe(false);
  });
});

describe("triggersStockRestoration", () => {
  it("returns true for confirmed → returned", () => {
    expect(triggersStockRestoration("confirmed", "returned")).toBe(true);
  });

  it("returns true for confirmed → cancelled", () => {
    expect(triggersStockRestoration("confirmed", "cancelled")).toBe(true);
  });

  it("returns true for shipped → returned", () => {
    expect(triggersStockRestoration("shipped", "returned")).toBe(true);
  });

  it("returns false for draft → cancelled (was never confirmed)", () => {
    expect(triggersStockRestoration("draft", "cancelled")).toBe(false);
  });

  it("returns false for pending → cancelled (was never confirmed)", () => {
    expect(triggersStockRestoration("pending", "cancelled")).toBe(false);
  });
});

describe("triggersCustomerStatsUpdate", () => {
  it("returns true for shipped → delivered", () => {
    expect(triggersCustomerStatsUpdate("shipped", "delivered")).toBe(true);
  });

  it("returns false for delivered → delivered (same status)", () => {
    expect(triggersCustomerStatsUpdate("delivered", "delivered")).toBe(false);
  });

  it("returns false for confirmed → shipped", () => {
    expect(triggersCustomerStatsUpdate("confirmed", "shipped")).toBe(false);
  });
});
