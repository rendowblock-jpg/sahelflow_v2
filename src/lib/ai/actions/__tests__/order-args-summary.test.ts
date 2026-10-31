/**
 * AIX-03 (server half): the create_order proposal summary carries the exact
 * arguments the approval card shows (customer, phone, address, each line with
 * quantity and the unit price the executor will use, and a total), built from
 * the same validated arguments and the same product snapshot as the target
 * binding the executor re-checks.
 */
import { describe, expect, it } from "vitest";

import { buildAiActionTargetSnapshot } from "../targets";

const now = new Date("2026-10-31T10:00:00.000Z");

function context() {
  return {
    prisma: {
      customer: {
        findFirst: async () => ({ id: "c1", name: "Karim Benali", updatedAt: now }),
      },
      product: {
        findMany: async () => [
          { id: "p1", name: "Écouteurs Bluetooth Pro", price: 4500, stock: 9, updatedAt: now, productVariants: [] },
          {
            id: "p2",
            name: "Casque X",
            price: 1000,
            stock: 5,
            updatedAt: now,
            productVariants: [
              { id: "v1", name: "Noir", price: 1200, stock: 2, isActive: true, updatedAt: now },
              { id: "v2", name: "Blanc", price: null, stock: 2, isActive: true, updatedAt: now },
            ],
          },
        ],
      },
    },
  } as never;
}

const ARGS = {
  customerId: "c1",
  items: [
    { productId: "p1", quantity: 2 },
    { productId: "p2", productVariantId: "v1", quantity: 1 },
    { productId: "p2", productVariantId: "v2", quantity: 3 },
  ],
  wilaya: "Alger",
  commune: "Bab Ezzouar",
  address: "12 rue des Oliviers",
  phone: "0555000101",
};

describe("create_order proposal summary", () => {
  it("carries customer, phone, address, every line with quantity and unit price, and the total", async () => {
    const { summary } = await buildAiActionTargetSnapshot(context(), "create_order", ARGS);
    expect(summary).toMatchObject({
      customerName: "Karim Benali",
      customerPhone: "0555000101",
      wilaya: "Alger",
      commune: "Bab Ezzouar",
      address: "12 rue des Oliviers",
      itemCount: 3,
      totalQuantity: 6,
    });
    expect(summary.lines).toEqual([
      { name: "Écouteurs Bluetooth Pro", variantName: null, quantity: 2, unitPrice: 4500 },
      { name: "Casque X", variantName: "Noir", quantity: 1, unitPrice: 1200 },
      // A variant without its own price is sold at the product price (executor: variant.price ?? product.price).
      { name: "Casque X", variantName: "Blanc", quantity: 3, unitPrice: 1000 },
    ]);
    expect(summary.orderTotal).toBe(2 * 4500 + 1200 + 3 * 1000);
  });

  it("keeps the optional notes only when the arguments have them", async () => {
    const without = await buildAiActionTargetSnapshot(context(), "create_order", ARGS);
    expect("notes" in without.summary).toBe(false);
    const withNotes = await buildAiActionTargetSnapshot(context(), "create_order", { ...ARGS, notes: "Livrer après 17h" });
    expect(withNotes.summary.notes).toBe("Livrer après 17h");
  });
});
