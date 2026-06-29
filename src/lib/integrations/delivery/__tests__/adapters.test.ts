/**
 * Delivery adapter metadata tests — id, name, logo for all 4 adapters.
 *
 * The actual API calls (estimateCost, createShipment, syncTracking) require
 * real provider credentials + network access, so they're not unit-tested here.
 * The DHD adapter has its own dedicated test file (dhd.test.ts).
 */
import { describe, it, expect } from "vitest";
import { yalidineAdapter } from "../yalidine";
import { maystroAdapter } from "../maystro";
import { zrExpressAdapter } from "../zr-express";
import { dhdAdapter } from "../dhd";

describe("delivery adapter metadata", () => {
  const adapters = [
    { adapter: yalidineAdapter, expectedId: "yalidine", expectedName: "Yalidine" },
    { adapter: maystroAdapter, expectedId: "maystro", expectedName: "Maystro Delivery" },
    { adapter: zrExpressAdapter, expectedId: "zrexpress", expectedName: "ZR Express" },
    { adapter: dhdAdapter, expectedId: "dhd", expectedName: "DHD Delivery" },
  ];

  for (const { adapter, expectedId, expectedName } of adapters) {
    describe(`${expectedName} adapter`, () => {
      it(`has id "${expectedId}"`, () => {
        expect(adapter.id).toBe(expectedId);
      });

      it(`has name "${expectedName}"`, () => {
        expect(adapter.name).toBe(expectedName);
      });

      it("has a logo (non-empty string)", () => {
        expect(typeof adapter.logo).toBe("string");
        expect(adapter.logo.length).toBeGreaterThan(0);
      });

      it("exposes estimateCost, createShipment, syncTracking functions", () => {
        expect(typeof adapter.estimateCost).toBe("function");
        expect(typeof adapter.createShipment).toBe("function");
        expect(typeof adapter.syncTracking).toBe("function");
      });
    });
  }
});
