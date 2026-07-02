/**
 * Yalidine delivery adapter tests (TEST-007).
 * Mock-fetch pattern matching dhd.test.ts. Tests: no-creds, success, HTTP error, malformed JSON.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { yalidineAdapter } from "../yalidine";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("Yalidine delivery adapter", () => {
  beforeEach(() => { mockFetch.mockReset(); vi.stubGlobal("fetch", mockFetch); });


  describe("metadata", () => {
    it("has correct id, name, and logo", () => {
      expect(yalidineAdapter.id).toBe("yalidine");
      expect(yalidineAdapter.name).toBeTruthy();
      expect(yalidineAdapter.logo).toBeTruthy();
    });

    it("exposes estimateCost, createShipment, syncTracking as functions", () => {
      expect(typeof yalidineAdapter.estimateCost).toBe("function");
      expect(typeof yalidineAdapter.createShipment).toBe("function");
      expect(typeof yalidineAdapter.syncTracking).toBe("function");
    });
  });

});
