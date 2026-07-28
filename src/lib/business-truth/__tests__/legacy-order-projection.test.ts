import { describe, expect, it } from "vitest";

import { projectLegacyOrderAuthority } from "../legacy-order-projection";

describe("projectLegacyOrderAuthority", () => {
  it("keeps draft inventory unreserved without inventing event facts", () => {
    const projection = projectLegacyOrderAuthority({
      status: "draft",
      codCollected: false,
      codRemitted: false,
    });

    expect(projection.order).toMatchObject({ value: "draft", certainty: "deterministic" });
    expect(projection.inventory).toMatchObject({ value: "unreserved", certainty: "deterministic" });
    expect(projection.provenFactIds).toEqual([]);
    expect(projection.requiresReview).toBe(true);
  });

  it("marks confirmed stock and confirmation proof as ambiguous without governed facts", () => {
    const projection = projectLegacyOrderAuthority({
      status: "confirmed",
      codCollected: false,
      codRemitted: false,
    });

    expect(projection.confirmation).toMatchObject({ value: "confirmed", certainty: "ambiguous" });
    expect(projection.confirmation.reason).toContain("imported directly");
    expect(projection.inventory).toMatchObject({ value: "reserved", certainty: "ambiguous" });
    expect(projection.warnings.join(" ")).toContain("without a reservation fact");
    expect(projection.provenFactIds).toEqual([]);
  });

  it("does not equate delivered with courier remittance", () => {
    const projection = projectLegacyOrderAuthority({
      status: "delivered",
      codCollected: false,
      codRemitted: false,
    });

    expect(projection.delivery).toMatchObject({ value: "delivered", certainty: "deterministic" });
    expect(projection.cod).toMatchObject({ value: "receivable", certainty: "ambiguous" });
  });

  it("treats a remitted boolean as compatibility evidence, not settlement proof", () => {
    const projection = projectLegacyOrderAuthority({
      status: "delivered",
      codCollected: true,
      codRemitted: true,
    });

    expect(projection.cod).toMatchObject({ value: "remitted", certainty: "ambiguous" });
    expect(projection.cod.reason).toContain("lacks settlement lines");
    expect(projection.provenFactIds).toEqual([]);
  });

  it("keeps legacy returned state ambiguous about receipt and inspection", () => {
    const projection = projectLegacyOrderAuthority({
      status: "returned",
      codCollected: true,
      codRemitted: false,
      refundCount: 1,
      activeRefundAmount: 1000,
      totalPrice: 2500,
    });

    expect(projection.delivery.certainty).toBe("ambiguous");
    expect(projection.inventory.value).toBe("unknown");
    expect(projection.returns).toMatchObject({ value: "completed", certainty: "ambiguous" });
    expect(projection.refund).toMatchObject({ value: "partially_refunded", certainty: "ambiguous" });
  });

  it("does not guess whether a cancelled order was confirmed or fulfilled", () => {
    const projection = projectLegacyOrderAuthority({
      status: "cancelled",
      codCollected: false,
      codRemitted: false,
    });

    expect(projection.order).toMatchObject({ value: "cancelled", certainty: "deterministic" });
    expect(projection.confirmation.value).toBe("unknown");
    expect(projection.fulfillment.value).toBe("unknown");
    expect(projection.inventory.value).toBe("unknown");
  });
});
