/**
 * S03c-06 — the manual delivery status update needs an explicit transition
 * table. This file pins the table itself (pure, no database).
 *
 * What the table must do:
 *   - keep every move the product really makes (provider steps in any order,
 *     skipping steps for offline couriers, failed → retry, delivered →
 *     returned for a post-delivery return);
 *   - refuse to "resurrect" an outcome that already moved the order
 *     (delivered / returned / refused cannot go back to an in-flight status);
 *   - never strand a row whose status is a booking limbo value
 *     (`creating`, `reconciliation_required`) or a historical odd value.
 */
import { describe, expect, it } from "vitest";

import {
  DELIVERY_STATUSES,
  DELIVERY_STATUS_TRANSITIONS,
  allowedDeliveryTransitions,
  assertDeliveryStatusTransition,
  canTransitionDelivery,
} from "@/lib/delivery/delivery-status-transitions";
import { InvalidTransitionError } from "@/types/errors";

const ACTIVE = [
  "pending",
  "created",
  "picked_up",
  "in_transit",
  "at_hub",
  "out_for_delivery",
  "failed",
] as const;

describe("delivery status vocabulary", () => {
  it("lists exactly the ten statuses the API, the badge and the adapters share", () => {
    expect([...DELIVERY_STATUSES].sort()).toEqual(
      [
        "at_hub",
        "created",
        "delivered",
        "failed",
        "in_transit",
        "out_for_delivery",
        "pending",
        "picked_up",
        "refused",
        "returned",
      ].sort(),
    );
  });

  it("has one row per status and only real statuses as targets, never itself", () => {
    expect(Object.keys(DELIVERY_STATUS_TRANSITIONS).sort()).toEqual(
      [...DELIVERY_STATUSES].sort(),
    );
    for (const from of DELIVERY_STATUSES) {
      for (const to of DELIVERY_STATUS_TRANSITIONS[from]) {
        expect(DELIVERY_STATUSES, `${from} -> ${to}`).toContain(to);
        expect(to, `${from} lists itself`).not.toBe(from);
      }
    }
  });
});

describe("allowed moves", () => {
  it("lets any in-flight status move to any other status (offline couriers skip steps, sync errors are corrected)", () => {
    for (const from of ACTIVE) {
      for (const to of DELIVERY_STATUSES) {
        expect(canTransitionDelivery(from, to), `${from} -> ${to}`).toBe(true);
      }
    }
  });

  it("keeps the exact moves the existing code and tests rely on", () => {
    // delivery-patch.test.ts, data-integrity.test.ts scenario 5, the badge.
    expect(canTransitionDelivery("in_transit", "delivered")).toBe(true);
    expect(canTransitionDelivery("in_transit", "returned")).toBe(true);
    expect(canTransitionDelivery("delivered", "returned")).toBe(true);
    expect(canTransitionDelivery("failed", "out_for_delivery")).toBe(true);
    expect(canTransitionDelivery("out_for_delivery", "refused")).toBe(true);
  });

  it("treats a same-status update as a harmless re-apply (it can retry the order propagation)", () => {
    for (const status of DELIVERY_STATUSES) {
      expect(canTransitionDelivery(status, status), status).toBe(true);
    }
  });

  it("allows a refused parcel to be recorded as returned to the seller", () => {
    expect(canTransitionDelivery("refused", "returned")).toBe(true);
  });
});

describe("refused moves (outcomes are final)", () => {
  it("delivered can only become returned", () => {
    expect([...allowedDeliveryTransitions("delivered")]).toEqual(["returned"]);
    for (const to of ["pending", "created", "in_transit", "failed", "refused"] as const) {
      expect(canTransitionDelivery("delivered", to), `delivered -> ${to}`).toBe(false);
    }
  });

  it("returned has no way out", () => {
    expect([...allowedDeliveryTransitions("returned")]).toEqual([]);
    for (const to of DELIVERY_STATUSES) {
      if (to === "returned") continue;
      expect(canTransitionDelivery("returned", to), `returned -> ${to}`).toBe(false);
    }
  });

  it("refused can only become returned", () => {
    expect([...allowedDeliveryTransitions("refused")]).toEqual(["returned"]);
    for (const to of ["delivered", "in_transit", "failed", "pending"] as const) {
      expect(canTransitionDelivery("refused", to), `refused -> ${to}`).toBe(false);
    }
  });
});

describe("rows that are not in the ten-status vocabulary are never stranded", () => {
  it.each(["creating", "reconciliation_required", "cancelled", "", "something-old"])(
    "%j can be corrected to any real status",
    (limbo) => {
      for (const to of DELIVERY_STATUSES) {
        expect(canTransitionDelivery(limbo, to), `${limbo} -> ${to}`).toBe(true);
      }
      expect([...allowedDeliveryTransitions(limbo)].sort()).toEqual(
        [...DELIVERY_STATUSES].sort(),
      );
    },
  );
});

describe("assertDeliveryStatusTransition", () => {
  it("throws the repo's 409 InvalidTransitionError with the allowed list for an impossible jump", () => {
    let caught: unknown;
    try {
      assertDeliveryStatusTransition("delivered", "in_transit");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(InvalidTransitionError);
    const error = caught as InvalidTransitionError;
    expect(error.code).toBe("INVALID_TRANSITION");
    expect(error.statusCode).toBe(409);
    expect(error.from).toBe("delivered");
    expect(error.to).toBe("in_transit");
    expect([...error.allowed]).toEqual(["returned"]);
    expect(error.message).toContain("delivered");
    expect(error.message).toContain("in_transit");
  });

  it("does not throw for an allowed or same-status move", () => {
    expect(() => assertDeliveryStatusTransition("in_transit", "delivered")).not.toThrow();
    expect(() => assertDeliveryStatusTransition("returned", "returned")).not.toThrow();
    expect(() => assertDeliveryStatusTransition("creating", "created")).not.toThrow();
  });
});
