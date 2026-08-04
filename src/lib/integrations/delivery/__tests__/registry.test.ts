/**
 * Delivery adapter registry tests (T-INTEGRATIONS).
 *
 * Verifies getDeliveryAdapter / listDeliveryAdapters: known providers return
 * the right adapter, unknown providers throw with a helpful message.
 *
 * Does NOT test loadDeliveryCredentials (needs real DB + Secret store).
 */
import { describe, it, expect } from "vitest";
import { getDeliveryAdapter, listDeliveryAdapters, PROVIDERS } from "../index";
import { yalidineAdapter } from "../yalidine";
import { maystroAdapter } from "../maystro";
import { zrExpressAdapter } from "../zr-express";
import { noestAdapter } from "../noest";

describe("Delivery adapter registry", () => {
  describe("getDeliveryAdapter", () => {
    it("returns the Yalidine adapter for 'yalidine'", () => {
      const adapter = getDeliveryAdapter("yalidine");
      expect(adapter).toBe(yalidineAdapter);
      expect(adapter.id).toBe("yalidine");
      expect(adapter.name).toBe("Yalidine");
    });

    it("returns the Maystro adapter for 'maystro'", () => {
      const adapter = getDeliveryAdapter("maystro");
      expect(adapter).toBe(maystroAdapter);
      expect(adapter.id).toBe("maystro");
    });

    it("returns the ZR Express adapter for 'zrexpress'", () => {
      const adapter = getDeliveryAdapter("zrexpress");
      expect(adapter).toBe(zrExpressAdapter);
      expect(adapter.id).toBe("zrexpress");
    });

    it("returns the NOEST adapter for 'noest'", () => {
      const adapter = getDeliveryAdapter("noest");
      expect(adapter).toBe(noestAdapter);
      expect(adapter.id).toBe("noest");
    });

    it("throws on unknown provider", () => {
      expect(() => getDeliveryAdapter("fedex")).toThrow(/Unknown delivery provider/);
      expect(() => getDeliveryAdapter("fedex")).toThrow(/fedex/);
    });

    it("throws on empty string", () => {
      expect(() => getDeliveryAdapter("")).toThrow(/Unknown delivery provider/);
    });

    it("throws on case-mismatch (Yalidine ≠ yalidine)", () => {
      expect(() => getDeliveryAdapter("Yalidine")).toThrow(/Unknown delivery provider/);
    });

    it("throws on 'zr-express' (correct is 'zrexpress' — no hyphen)", () => {
      expect(() => getDeliveryAdapter("zr-express")).toThrow(/Unknown delivery provider/);
    });

    it("the returned adapter exposes estimateCost, createShipment, syncTracking", () => {
      const adapter = getDeliveryAdapter("yalidine");
      expect(typeof adapter.estimateCost).toBe("function");
      expect(typeof adapter.createShipment).toBe("function");
      expect(typeof adapter.syncTracking).toBe("function");
    });
  });

  describe("listDeliveryAdapters", () => {
    it("returns all 4 registered adapters", () => {
      const adapters = listDeliveryAdapters();
      expect(adapters).toHaveLength(4);
    });

    it("includes yalidine, maystro, zrexpress, noest", () => {
      const ids = listDeliveryAdapters().map((a) => a.id);
      expect(ids).toContain("yalidine");
      expect(ids).toContain("maystro");
      expect(ids).toContain("zrexpress");
      expect(ids).toContain("noest");
    });

    it("each adapter has id + name + logo + estimateCost + createShipment + syncTracking", () => {
      for (const adapter of listDeliveryAdapters()) {
        expect(typeof adapter.id).toBe("string");
        expect(typeof adapter.name).toBe("string");
        expect(typeof adapter.logo).toBe("string");
        expect(typeof adapter.estimateCost).toBe("function");
        expect(typeof adapter.createShipment).toBe("function");
        expect(typeof adapter.syncTracking).toBe("function");
      }
    });
  });

  describe("PROVIDERS constant", () => {
    it("lists all 4 providers in canonical order", () => {
      expect(PROVIDERS).toEqual(["yalidine", "maystro", "zrexpress", "noest"]);
    });
  });
});
