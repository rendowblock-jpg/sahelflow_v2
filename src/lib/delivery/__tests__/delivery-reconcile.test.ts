/**
 * S03c-08 — the exit from a stuck courier booking (pure core).
 * A delivery in `reconciliation_required` must always have a way out, and no
 * other status may borrow that way.
 */
import { describe, expect, it } from "vitest";

import {
  DELIVERY_STATUS_SET,
  DeliveryReconcileRefusedError,
  DeliveryTrackingMismatchError,
  RECONCILE_ACTIONS,
  RECONCILIATION_STATUS,
  nextDeliveryStatus,
  normalizeCourierTracking,
  planReconcile,
} from "@/lib/delivery/delivery-reconcile";
import {
  DELIVERY_STATUSES,
  allowedDeliveryTransitions,
} from "@/lib/delivery/delivery-status-transitions";

describe("nextDeliveryStatus", () => {
  it.each([
    ["courier-has-it", "created"],
    ["book-again", "released"],
  ] as const)("reconciliation_required + %s -> %s", (action, expected) => {
    expect(nextDeliveryStatus(RECONCILIATION_STATUS, action)).toBe(expected);
  });

  const others = DELIVERY_STATUS_SET.filter((s) => s !== RECONCILIATION_STATUS);
  const cases = others.flatMap((status) =>
    RECONCILE_ACTIONS.map((action) => [status, action] as const),
  );
  it.each(cases)("%s + %s is refused with a typed error", (status, action) => {
    let caught: unknown;
    try {
      nextDeliveryStatus(status, action);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(DeliveryReconcileRefusedError);
    expect(caught).toMatchObject({
      code: "DELIVERY_NOT_AWAITING_DECISION",
      statusCode: 409,
      from: status,
      action,
    });
  });

  it("refuses an unknown status string and an unknown action", () => {
    expect(() => nextDeliveryStatus("whatever", "book-again")).toThrow(
      DeliveryReconcileRefusedError,
    );
    expect(() =>
      nextDeliveryStatus(RECONCILIATION_STATUS, "delete" as never),
    ).toThrow(DeliveryReconcileRefusedError);
  });
});

describe("no delivery can stay stuck (property)", () => {
  const terminal = DELIVERY_STATUS_SET.filter(
    (s) => (DELIVERY_STATUSES as readonly string[]).includes(s) && allowedDeliveryTransitions(s).length === 0,
  );

  function edges(from: string): string[] {
    const out: string[] = [];
    if (from === "creating") out.push(RECONCILIATION_STATUS, ...allowedDeliveryTransitions(from));
    else if ((DELIVERY_STATUSES as readonly string[]).includes(from)) {
      out.push(...allowedDeliveryTransitions(from));
    }
    if (from === RECONCILIATION_STATUS) {
      for (const action of RECONCILE_ACTIONS) out.push(nextDeliveryStatus(from, action));
    }
    return out;
  }

  it("has a terminal status to reach", () => {
    expect(terminal).toContain("returned");
  });

  it.each(DELIVERY_STATUS_SET.map((s) => [s]))(
    "%s is terminal or reaches a terminal status",
    (start) => {
      const seen = new Set<string>([start]);
      const queue = [start];
      let reached = terminal.includes(start);
      while (queue.length && !reached) {
        const next = edges(queue.shift() as string);
        for (const n of next) {
          if (n === "released") { reached = true; break; }
          if (terminal.includes(n)) { reached = true; break; }
          if (!seen.has(n)) { seen.add(n); queue.push(n); }
        }
      }
      expect(reached).toBe(true);
    },
  );

  it("every action leaves the limbo", () => {
    for (const action of RECONCILE_ACTIONS) {
      const next = nextDeliveryStatus(RECONCILIATION_STATUS, action);
      expect(["creating", RECONCILIATION_STATUS]).not.toContain(next);
    }
  });
});

describe("normalizeCourierTracking", () => {
  it.each([
    ["  YAL-123456  ", "YAL-123456"],
    ["ab1234", "ab1234"],
  ])("accepts %j", (raw, expected) => {
    expect(normalizeCourierTracking(raw)).toBe(expected);
  });
  it.each([[""], ["   "], ["YAL 123"], ["YAL\n123"], ["x".repeat(121)], ["\u0000abc"]])(
    "rejects %j",
    (raw) => {
      expect(normalizeCourierTracking(raw)).toBeNull();
    },
  );
});

describe("planReconcile", () => {
  const stuck = { status: RECONCILIATION_STATUS, trackingNumber: null };
  it("applies courier-has-it on a stuck delivery", () => {
    expect(
      planReconcile(stuck, { action: "courier-has-it", tracking: "YAL-1" }),
    ).toEqual({ kind: "apply", next: "created" });
  });
  it("applies book-again on a stuck delivery", () => {
    expect(planReconcile(stuck, { action: "book-again" })).toEqual({
      kind: "apply",
      next: "released",
    });
  });
  it("same tracking twice is a no-op, not an error", () => {
    for (const status of ["created", "in_transit", "delivered"]) {
      expect(
        planReconcile(
          { status, trackingNumber: "YAL-1" },
          { action: "courier-has-it", tracking: "YAL-1" },
        ),
      ).toEqual({ kind: "noop" });
    }
  });
  it("a different tracking number than the saved one is a typed conflict", () => {
    expect(() =>
      planReconcile(
        { status: "created", trackingNumber: "YAL-1" },
        { action: "courier-has-it", tracking: "YAL-2" },
      ),
    ).toThrow(DeliveryTrackingMismatchError);
  });
  it("book-again is never a no-op: a delivery that already has a tracking number is refused", () => {
    expect(() =>
      planReconcile(
        { status: "created", trackingNumber: "YAL-1" },
        { action: "book-again" },
      ),
    ).toThrow(DeliveryReconcileRefusedError);
  });
  it("a non-stuck delivery without tracking is refused for both actions", () => {
    const pending = { status: "pending", trackingNumber: null };
    expect(() =>
      planReconcile(pending, { action: "courier-has-it", tracking: "YAL-1" }),
    ).toThrow(DeliveryReconcileRefusedError);
    expect(() => planReconcile(pending, { action: "book-again" })).toThrow(
      DeliveryReconcileRefusedError,
    );
  });
  it("a stuck delivery that somehow has a tracking number is refused (cannot orphan a real parcel)", () => {
    expect(() =>
      planReconcile(
        { status: RECONCILIATION_STATUS, trackingNumber: "YAL-9" },
        { action: "book-again" },
      ),
    ).toThrow(DeliveryReconcileRefusedError);
  });
});
