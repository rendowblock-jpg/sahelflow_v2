/**
 * Delivery adapter metadata tests — id, name, logo for all 4 adapters.
 *
 * Metadata remains covered here. Deterministic request/response behavior is
 * covered by provider-conformance.test.ts, retry.test.ts and noest.test.ts without
 * requiring real provider credentials or external network access.
 */
import { describe, it, expect } from "vitest";
import { yalidineAdapter } from "../yalidine";
import { maystroAdapter } from "../maystro";
import { zrExpressAdapter } from "../zr-express";
import { noestAdapter } from "../noest";

describe("delivery adapter metadata", () => {
  const adapters = [
    {
      adapter: yalidineAdapter,
      expectedId: "yalidine",
      expectedName: "Yalidine",
    },
    {
      adapter: maystroAdapter,
      expectedId: "maystro",
      expectedName: "Maystro Delivery",
    },
    {
      adapter: zrExpressAdapter,
      expectedId: "zrexpress",
      expectedName: "ZR Express",
    },
    {
      adapter: noestAdapter,
      expectedId: "noest",
      expectedName: "NOEST Express",
    },
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
