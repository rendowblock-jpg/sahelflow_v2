import { describe, expect, it } from "vitest";

import { projectLegacyOrderAuthority } from "../legacy-order-projection";

describe("legacy delivery compatibility projection", () => {
  it("does not infer no delivery from a confirmed order status alone", () => {
    const projection = projectLegacyOrderAuthority({
      status: "confirmed",
      codCollected: false,
      codRemitted: false,
    });

    expect(projection.delivery).toMatchObject({
      value: "unknown",
      certainty: "ambiguous",
    });
    expect(projection.requiresReview).toBe(true);
  });

  it("surfaces a known Delivery row without pretending its provider state is canonical", () => {
    const projection = projectLegacyOrderAuthority({
      status: "confirmed",
      codCollected: false,
      codRemitted: false,
      deliveryExists: true,
    });

    expect(projection.delivery).toMatchObject({
      value: "pending",
      certainty: "ambiguous",
    });
    expect(projection.delivery.reason).toContain("Delivery row exists");
  });

  it("uses not_created only when the compatibility reader explicitly verified absence", () => {
    const projection = projectLegacyOrderAuthority({
      status: "confirmed",
      codCollected: false,
      codRemitted: false,
      deliveryExists: false,
    });

    expect(projection.delivery).toMatchObject({
      value: "not_created",
      certainty: "deterministic",
    });
  });

  it("keeps an imported delivered label ambiguous without governed evidence", () => {
    const projection = projectLegacyOrderAuthority({
      status: "delivered",
      codCollected: false,
      codRemitted: false,
    });

    expect(projection.delivery).toMatchObject({
      value: "delivered",
      certainty: "ambiguous",
    });
    expect(projection.delivery.reason).toContain("imported directly");
  });

  it("treats deliveredAt as governed legacy completion evidence", () => {
    const deliveredAt = new Date("2026-07-28T07:30:00.000Z");
    const projection = projectLegacyOrderAuthority({
      status: "delivered",
      codCollected: false,
      codRemitted: false,
      deliveredAt,
    });

    expect(projection.delivery).toMatchObject({
      value: "delivered",
      certainty: "deterministic",
    });
    expect(projection.delivery.reason).toContain("completion timestamp");
  });
});
