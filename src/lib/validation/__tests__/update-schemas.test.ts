import { describe, expect, it } from "vitest";
import {
  createProductSchema,
  updateCustomerSchema,
  updateExpenseSchema,
  updateProductSchema,
} from "../index";

/**
 * Contract pin for the zod v4 `.partial()` × `.default()` data-loss repair.
 *
 * In zod v4, `createProductSchema.partial()` PRESERVES default backfill:
 * `parse({ name: "x" })` returned `{ name: "x", stock: 0,
 * lowStockThreshold: 5, isActive: true }`, and update routes write the parsed
 * object straight into Prisma — silently resetting stock, force-republishing
 * products and falsely tripping stock-mutation gates on every PATCH.
 *
 * Update-schema truth: a field absent from the request body must stay absent
 * in the parsed output ("do not touch"). These tests fail if any update
 * schema regresses to default backfill.
 */
describe("update schema default-backfill truth", () => {
  it("updateProductSchema keeps absent fields absent (no create-default backfill)", () => {
    const parsed = updateProductSchema.parse({ name: "Renamed only" });
    expect(Object.keys(parsed).sort()).toEqual(["name"]);
    expect("stock" in parsed).toBe(false);
    expect("lowStockThreshold" in parsed).toBe(false);
    expect("isActive" in parsed).toBe(false);
  });

  it("updateProductSchema preserves explicit optional-field updates", () => {
    const parsed = updateProductSchema.parse({
      stock: 12,
      lowStockThreshold: 3,
      isActive: false,
    });
    expect(parsed).toEqual({ stock: 12, lowStockThreshold: 3, isActive: false });
  });

  it("updateProductSchema still rejects invalid provided values", () => {
    expect(() => updateProductSchema.parse({ stock: 1.5 })).toThrow();
    expect(() => updateProductSchema.parse({ name: "" })).toThrow();
    expect(() => updateProductSchema.parse({ lowStockThreshold: -1 })).toThrow();
  });

  it("cost remains visible to the route permission gate when provided", () => {
    // products/[id] PATCH gates products.cost.* on `data.cost !== undefined`;
    // the field must therefore survive parsing untouched.
    const provided = updateProductSchema.parse({ cost: 1500 });
    expect(provided.cost).toBe(1500);
    const absent = updateProductSchema.parse({ name: "x" });
    expect("cost" in absent).toBe(false);
  });

  it("explicitly provided variants keep full-set replacement defaults (intended semantics)", () => {
    // Variant edits replace the whole set (missing variant ids are deleted in
    // product-service.update), so element-level defaults backfill by design.
    // This pin documents that difference so the two layers are never confused.
    const parsed = updateProductSchema.parse({
      variants: [{ name: "Size M" }],
    });
    expect(parsed.variants?.[0]).toMatchObject({
      name: "Size M",
      stock: 0,
      isActive: true,
      sortOrder: 0,
    });
  });

  it("updateCustomerSchema and updateExpenseSchema keep absent fields absent", () => {
    // Neither create schema carries defaults today; this pin fails if someone
    // later adds a default and leaves `.partial()` in place (the exact trap
    // that produced the product stock-reset defect).
    expect(updateCustomerSchema.parse({})).toEqual({});
    expect(updateCustomerSchema.parse({ name: "A", phone: "0555123456" })).toEqual({
      name: "A",
      phone: "0555123456",
    });
    expect(updateExpenseSchema.parse({ notes: null })).toEqual({ notes: null });
  });

  it("createProductSchema itself still backfills defaults (create-time truth unchanged)", () => {
    const parsed = createProductSchema.parse({ name: "New", price: 100 });
    expect(parsed).toMatchObject({ stock: 0, lowStockThreshold: 5, isActive: true });
  });
});
