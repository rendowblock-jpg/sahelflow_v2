import { describe, it, expect } from "vitest";
import { computeDeliveryCost } from "../shipping-service";

describe("Server-side delivery cost", () => {
  const shippingRates = {
    "16": { home: 350, desk: 280 }, // Alger — custom rate
    "31": { home: 400, desk: 320 }, // Oran — custom rate
  };

  it("computes home delivery cost from seller shipping_rates", () => {
    expect(computeDeliveryCost("Alger", "home", shippingRates)).toBe(350);
  });

  it("computes desk delivery cost from seller shipping_rates", () => {
    expect(computeDeliveryCost("Oran", "desk", shippingRates)).toBe(320);
  });

  it("falls back to zone pricing when wilaya not in seller rates", () => {
    // Constantine (zone: east) has no custom entry
    expect(computeDeliveryCost("Constantine", "home", shippingRates)).toBe(500);
    expect(computeDeliveryCost("Constantine", "desk", shippingRates)).toBe(380);
  });

  it("returns safe default (500) for unknown wilaya — not 0 which would give free shipping", () => {
    expect(computeDeliveryCost("UnknownCity", "home", shippingRates)).toBe(500);
  });

  it("returns zone fallback when shippingRates is null", () => {
    expect(computeDeliveryCost("Alger", "home", null)).toBe(400);
  });

  it("handles lowercase wilaya names", () => {
    expect(computeDeliveryCost("alger", "desk", shippingRates)).toBe(280);
  });
});
