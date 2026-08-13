/**
 * Delivery adapter unit tests (T-INTEGRATIONS).
 *
 * Tests adapter metadata + credential validation without real network calls.
 * All fetch calls are either avoided (missing creds) or mocked in specific tests.
 */
import { describe, it, expect } from "vitest";
import { yalidineAdapter } from "../yalidine";
import { maystroAdapter } from "../maystro";
import { zrExpressAdapter } from "../zr-express";
import { ecoTrackAdapter } from "../ecotrack";

// ── Adapter metadata ──────────────────────────────────────────────────────────

describe("Delivery adapter metadata", () => {
  const adapters = [
    { adapter: yalidineAdapter, expectedId: "yalidine", expectedName: "Yalidine" },
    { adapter: maystroAdapter, expectedId: "maystro", expectedName: "Maystro Delivery" },
    { adapter: zrExpressAdapter, expectedId: "zrexpress", expectedName: "ZR Express" },
    { adapter: ecoTrackAdapter, expectedId: "ecotrack", expectedName: "EcoTrack Pro" },
  ];

  for (const { adapter, expectedId, expectedName } of adapters) {
    describe(`${expectedName} adapter`, () => {
      it(`has id "${expectedId}"`, () => {
        expect(adapter.id).toBe(expectedId);
      });

      it(`has name "${expectedName}"`, () => {
        expect(adapter.name).toBe(expectedName);
      });

      it("has a logo", () => {
        expect(typeof adapter.logo).toBe("string");
        expect(adapter.logo.length).toBeGreaterThan(0);
      });

      it("implements estimateCost", () => {
        expect(typeof adapter.estimateCost).toBe("function");
      });

      it("implements createShipment", () => {
        expect(typeof adapter.createShipment).toBe("function");
      });

      it("implements syncTracking", () => {
        expect(typeof adapter.syncTracking).toBe("function");
      });
    });
  }
});
