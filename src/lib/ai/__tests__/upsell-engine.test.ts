import { describe, it, expect } from "vitest";
import { generateUpsellSuggestions } from "../upsell-engine";

const CATALOG = [
  { id: "p1", name: "Parfum Deluxe", price: 3500, cost_price: 1200, stock: 10, category_id: "cat1", image_url: null, active: true, categories: { name: "Beauty" } },
  { id: "p2", name: "Robe Élégante", price: 4800, cost_price: 1800, stock: 5, category_id: "cat2", image_url: null, active: true, categories: { name: "Fashion" } },
  { id: "p3", name: "Montre Sport", price: 6000, cost_price: 2500, stock: 3, category_id: "cat3", image_url: null, active: true, categories: { name: "Electronics" } },
  { id: "p4", name: "Crème Hydratante", price: 1500, cost_price: 400, stock: 20, category_id: "cat1", image_url: null, active: true, categories: { name: "Beauty" } },
  { id: "p5", name: "Low Margin Item", price: 1000, cost_price: 900, stock: 5, category_id: "cat1", image_url: null, active: true, categories: { name: "Beauty" } },
  { id: "p6", name: "Out of Stock", price: 2000, cost_price: 500, stock: 0, category_id: "cat1", image_url: null, active: true, categories: { name: "Beauty" } },
  { id: "p7", name: "Inactive Product", price: 3000, cost_price: 800, stock: 10, category_id: "cat2", image_url: null, active: false, categories: { name: "Fashion" } },
];

describe("Upsell Suggestion Engine", () => {
  it("returns empty array when no catalog products match", () => {
    const result = generateUpsellSuggestions(
      [{ product_name: "Test", quantity: 1 }],
      [],
    );
    expect(result).toEqual([]);
  });

  it("excludes products already in the order", () => {
    const result = generateUpsellSuggestions(
      [{ product_id: "p1", product_name: "Parfum Deluxe", quantity: 1 }],
      CATALOG,
    );
    expect(result.find((r) => r.product_id === "p1")).toBeUndefined();
  });

  it("excludes out-of-stock products", () => {
    const result = generateUpsellSuggestions(
      [{ product_name: "Test", quantity: 1 }],
      CATALOG,
    );
    expect(result.find((r) => r.product_id === "p6")).toBeUndefined();
  });

  it("excludes inactive products", () => {
    const result = generateUpsellSuggestions(
      [{ product_name: "Test", quantity: 1 }],
      CATALOG,
    );
    expect(result.find((r) => r.product_id === "p7")).toBeUndefined();
  });

  it("excludes products below minimum margin percent", () => {
    const result = generateUpsellSuggestions(
      [{ product_name: "Test", quantity: 1 }],
      CATALOG,
      { minMarginPercent: 20 },
    );
    expect(result.find((r) => r.product_id === "p5")).toBeUndefined();
  });

  it("calculates margin and margin percent correctly", () => {
    const result = generateUpsellSuggestions(
      [{ product_name: "Test", quantity: 1 }],
      CATALOG,
    );
    const cream = result.find((r) => r.product_id === "p4");
    expect(cream).toBeDefined();
    expect(cream!.margin).toBe(1100);
    expect(cream!.marginPercent).toBe(73);
  });

  it("respects maxSuggestions limit", () => {
    const result = generateUpsellSuggestions(
      [{ product_name: "Test", quantity: 1 }],
      CATALOG,
      { maxSuggestions: 2 },
    );
    expect(result.length).toBeLessThanOrEqual(2);
  });

  it("prioritizes same-category products", () => {
    const result = generateUpsellSuggestions(
      [{ product_id: "p1", product_name: "Parfum Deluxe", quantity: 1 }],
      CATALOG,
      { maxSuggestions: 5 },
    );
    const creamIndex = result.findIndex((r) => r.product_id === "p4");
    const watchIndex = result.findIndex((r) => r.product_id === "p3");
    expect(creamIndex).toBeLessThan(watchIndex);
  });

  it("includes reason for each suggestion", () => {
    const result = generateUpsellSuggestions(
      [{ product_id: "p1", product_name: "Parfum Deluxe", quantity: 1 }],
      CATALOG,
    );
    for (const suggestion of result) {
      expect(suggestion.reason).toBeTruthy();
      expect(typeof suggestion.reason).toBe("string");
    }
  });

  it("handles empty order items gracefully", () => {
    const result = generateUpsellSuggestions([], CATALOG);
    expect(result.length).toBeGreaterThan(0);
  });
});
