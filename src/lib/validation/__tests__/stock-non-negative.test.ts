/**
 * S03c-04: stock is never negative at the validation layer. The product and
 * variant schemas used to accept any integer ("can be negative (backorders)"),
 * so a manual or imported negative number drove Product.stock below zero and
 * every canonical confirm of that product was then refused (available =
 * stock - holds).
 */
import { describe, it, expect } from "vitest";

import {
  createProductSchema,
  productVariantSchema,
  updateProductSchema,
} from "../index";

const base = { name: "Robe", price: 4500 };

describe("stock validation (S03c-04)", () => {
  it("rejects a negative product stock on create", () => {
    expect(createProductSchema.safeParse({ ...base, stock: -1 }).success).toBe(false);
  });

  it("rejects a negative product stock on update", () => {
    expect(updateProductSchema.safeParse({ stock: -5 }).success).toBe(false);
  });

  it("rejects a negative variant stock", () => {
    expect(productVariantSchema.safeParse({ name: "M", stock: -1 }).success).toBe(false);
    expect(
      createProductSchema.safeParse({
        ...base,
        variants: [{ name: "M", stock: -3 }],
      }).success,
    ).toBe(false);
  });

  it("rejects a fractional stock", () => {
    expect(createProductSchema.safeParse({ ...base, stock: 1.5 }).success).toBe(false);
  });

  it("still accepts zero and positive stock", () => {
    expect(createProductSchema.parse({ ...base, stock: 0 }).stock).toBe(0);
    expect(createProductSchema.parse({ ...base, stock: 12 }).stock).toBe(12);
    expect(updateProductSchema.parse({ stock: 0 }).stock).toBe(0);
    expect(productVariantSchema.parse({ name: "M", stock: 4 }).stock).toBe(4);
  });

  it("keeps the defaults: absent stock is 0 on create and absent on update", () => {
    expect(createProductSchema.parse(base).stock).toBe(0);
    expect(updateProductSchema.parse({ name: "x" }).stock).toBeUndefined();
    expect(productVariantSchema.parse({ name: "M" }).stock).toBe(0);
  });
});
