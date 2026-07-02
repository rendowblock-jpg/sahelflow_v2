/**
 * E-commerce adapter registry tests (T-INTEGRATIONS).
 *
 * Verifies the getEcommerceAdapter / listEcommerceAdapters registry
 * functions: known platforms return the right adapter, unknown platforms
 * throw with a helpful error message.
 *
 * Does NOT test loadEcommerceCredentials (which needs a real DB + Secret
 * store — covered indirectly by sync-engine.test.ts).
 */
import { describe, it, expect } from "vitest";
import { getEcommerceAdapter, listEcommerceAdapters } from "../index";
import { shopifyAdapter } from "../shopify";
import { woocommerceAdapter } from "../woocommerce";
import { youcanAdapter } from "../youcan";

describe("E-commerce adapter registry", () => {
  describe("getEcommerceAdapter", () => {
    it("returns the Shopify adapter for 'shopify'", () => {
      const adapter = getEcommerceAdapter("shopify");
      expect(adapter).toBe(shopifyAdapter);
      expect(adapter.platform).toBe("shopify");
      expect(adapter.displayName).toBe("Shopify");
    });

    it("returns the WooCommerce adapter for 'woocommerce'", () => {
      const adapter = getEcommerceAdapter("woocommerce");
      expect(adapter).toBe(woocommerceAdapter);
      expect(adapter.platform).toBe("woocommerce");
      expect(adapter.displayName).toBe("WooCommerce");
    });

    it("returns the YouCan adapter for 'youcan'", () => {
      const adapter = getEcommerceAdapter("youcan");
      expect(adapter).toBe(youcanAdapter);
      expect(adapter.platform).toBe("youcan");
      expect(adapter.displayName).toBe("YouCan");
    });

    it("throws on unknown platform", () => {
      expect(() => getEcommerceAdapter("amazon")).toThrow(/Unknown e-commerce platform/);
      expect(() => getEcommerceAdapter("amazon")).toThrow(/amazon/);
    });

    it("throws on empty string", () => {
      expect(() => getEcommerceAdapter("")).toThrow(/Unknown e-commerce platform/);
    });

    it("throws on case-mismatch (Shopify ≠ shopify)", () => {
      expect(() => getEcommerceAdapter("Shopify")).toThrow(/Unknown e-commerce platform/);
    });

    it("the returned adapter has a listOrdersSince function", () => {
      const adapter = getEcommerceAdapter("shopify");
      expect(typeof adapter.listOrdersSince).toBe("function");
    });
  });

  describe("listEcommerceAdapters", () => {
    it("returns all 3 registered adapters", () => {
      const adapters = listEcommerceAdapters();
      expect(adapters).toHaveLength(3);
    });

    it("includes shopify, woocommerce, youcan", () => {
      const platforms = listEcommerceAdapters().map((a) => a.platform);
      expect(platforms).toContain("shopify");
      expect(platforms).toContain("woocommerce");
      expect(platforms).toContain("youcan");
    });

    it("each adapter has platform + displayName + listOrdersSince", () => {
      for (const adapter of listEcommerceAdapters()) {
        expect(typeof adapter.platform).toBe("string");
        expect(typeof adapter.displayName).toBe("string");
        expect(typeof adapter.listOrdersSince).toBe("function");
      }
    });
  });
});
