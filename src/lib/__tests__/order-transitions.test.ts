/**
 * Order Status Transition Tests
 *
 * Tests the TS source of truth in @/lib/order-transitions, which mirrors the
 * enforcement in the `atomic_update_order_status` PostgreSQL RPC
 * (supabase/migrations/000_baseline.sql:1075-1163).
 *
 * Rules under test:
 *  - 8 statuses total (incl. 'cancelled' — was missing in the old tautological test).
 *  - 4 terminal states: delivered, returned, refused, cancelled.
 *  - Same-status transitions are no-ops (always valid).
 *  - Terminal → different status is BLOCKED (raises 'Cannot transition from terminal state %').
 *  - Non-terminal → any status is ALLOWED (the SQL enforces no sequence).
 */
import { describe, it, expect } from "vitest";
import {
  ORDER_STATUSES,
  TERMINAL_ORDER_STATUSES,
  ACTIVE_ORDER_STATUSES,
  isTerminalStatus,
  isValidTransition,
  transitionErrorMessage,
} from "@/lib/order-transitions";
import type { OrderStatus } from "@/types/database";

describe("Order Status Transition State Machine", () => {
  describe("ORDER_STATUSES", () => {
    it("includes all 8 statuses from the orders.status CHECK constraint", () => {
      expect(ORDER_STATUSES).toEqual([
        "draft",
        "pending",
        "confirmed",
        "shipped",
        "delivered",
        "returned",
        "refused",
        "cancelled",
      ]);
    });

    it("includes 'cancelled' (was missing in the old tautological test)", () => {
      expect(ORDER_STATUSES).toContain("cancelled");
    });
  });

  describe("TERMINAL_ORDER_STATUSES", () => {
    it("includes exactly the 4 terminal states enforced by the SQL RPC", () => {
      expect(TERMINAL_ORDER_STATUSES).toEqual([
        "delivered",
        "returned",
        "refused",
        "cancelled",
      ]);
    });

    it("matches the SQL IN ('delivered','returned','refused','cancelled') clause", () => {
      // Mirrors baseline.sql:1112
      const sqlTerminalClause = [
        "delivered",
        "returned",
        "refused",
        "cancelled",
      ];
      expect([...TERMINAL_ORDER_STATUSES].sort()).toEqual(
        [...sqlTerminalClause].sort(),
      );
    });
  });

  describe("ACTIVE_ORDER_STATUSES", () => {
    it("is the complement of terminal statuses", () => {
      expect(ACTIVE_ORDER_STATUSES).toEqual([
        "draft",
        "pending",
        "confirmed",
        "shipped",
      ]);
    });

    it("has no overlap with terminal statuses", () => {
      for (const active of ACTIVE_ORDER_STATUSES) {
        expect(TERMINAL_ORDER_STATUSES).not.toContain(active);
      }
    });
  });

  describe("isTerminalStatus", () => {
    it("returns true for all 4 terminal states", () => {
      for (const s of TERMINAL_ORDER_STATUSES) {
        expect(isTerminalStatus(s)).toBe(true);
      }
    });

    it("returns false for all 4 active states", () => {
      for (const s of ACTIVE_ORDER_STATUSES) {
        expect(isTerminalStatus(s)).toBe(false);
      }
    });
  });

  describe("isValidTransition", () => {
    describe("same-status transitions (no-ops)", () => {
      // The SQL returns early on same-status without raising (baseline.sql:1116-1119)
      for (const status of ORDER_STATUSES) {
        it(`allows ${status} → ${status} (no-op)`, () => {
          expect(isValidTransition(status, status)).toBe(true);
        });
      }
    });

    describe("terminal → different status (BLOCKED)", () => {
      // Mirrors baseline.sql:1112-1114 — raises 'Cannot transition from terminal state %'
      for (const from of TERMINAL_ORDER_STATUSES) {
        for (const to of ORDER_STATUSES) {
          if (from === to) continue; // covered above
          it(`blocks ${from} → ${to} (terminal state)`, () => {
            expect(isValidTransition(from, to)).toBe(false);
          });
        }
      }
    });

    describe("non-terminal → any status (ALLOWED)", () => {
      // The SQL does NOT enforce a sequence — any non-terminal → any status is valid.
      // (App-layer workflow may discourage e.g. draft→delivered, but the RPC allows it.)
      for (const from of ACTIVE_ORDER_STATUSES) {
        for (const to of ORDER_STATUSES) {
          it(`allows ${from} → ${to}`, () => {
            expect(isValidTransition(from, to)).toBe(true);
          });
        }
      }
    });

    it("does NOT enforce a draft→pending→confirmed sequence (SQL allows any non-terminal hop)", () => {
      // The old tautological test asserted draft→confirmed is blocked. The SQL RPC
      // does NOT enforce this — it only blocks terminal→different. Confirm the
      // TS source of truth matches the SQL, not the fictional sequence.
      expect(isValidTransition("draft", "confirmed")).toBe(true);
      expect(isValidTransition("draft", "delivered")).toBe(true);
      expect(isValidTransition("pending", "delivered")).toBe(true);
    });
  });

  describe("transitionErrorMessage", () => {
    it("returns null for valid transitions", () => {
      expect(transitionErrorMessage("pending", "confirmed")).toBeNull();
      expect(transitionErrorMessage("draft", "draft")).toBeNull();
      expect(transitionErrorMessage("confirmed", "delivered")).toBeNull();
    });

    it("returns the SQL error message for terminal→different", () => {
      // Mirrors baseline.sql:1113: RAISE EXCEPTION 'Cannot transition from terminal state %'
      expect(transitionErrorMessage("delivered", "pending")).toBe(
        "Cannot transition from terminal state delivered",
      );
      expect(transitionErrorMessage("returned", "pending")).toBe(
        "Cannot transition from terminal state returned",
      );
      expect(transitionErrorMessage("refused", "pending")).toBe(
        "Cannot transition from terminal state refused",
      );
      expect(transitionErrorMessage("cancelled", "pending")).toBe(
        "Cannot transition from terminal state cancelled",
      );
    });

    it("returns null for same-status on terminal state (no-op, not an error)", () => {
      expect(transitionErrorMessage("delivered", "delivered")).toBeNull();
      expect(transitionErrorMessage("cancelled", "cancelled")).toBeNull();
    });
  });

  describe("completeness — every status is classified", () => {
    it("every OrderStatus is either active or terminal", () => {
      const all = new Set<string>(ORDER_STATUSES);
      const classified = new Set<string>([
        ...ACTIVE_ORDER_STATUSES,
        ...TERMINAL_ORDER_STATUSES,
      ]);
      expect(classified).toEqual(all);
    });
  });
});

// Type-level sanity check: ensure OrderStatus from database.ts aligns with our list.
// (If database.ts adds/removes a status, this test file must be updated.)
const _typeCheck: OrderStatus[] = ["draft", "pending", "confirmed", "shipped"];
void _typeCheck;
