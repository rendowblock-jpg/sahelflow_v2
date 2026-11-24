import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { analyticsService } from "@/lib/data/analytics";
import { productServiceExtensions } from "@/lib/data/extensions/product-extensions";
import {
  createTestPrisma,
  disconnectTestPrisma,
  seedCategory,
  seedCustomer,
  seedProduct,
} from "@/lib/data/__tests__/helpers";
import { allocateOrderDiscount, netOrderItemRevenues } from "@/lib/orders/order-total";

describe("F-0067: per-product revenue deducts pro-rata order discount", () => {
  let db: PrismaClient;

  beforeEach(async () => {
    db = await createTestPrisma();
  });

  afterEach(async () => {
    await disconnectTestPrisma(db);
  });

  it("netOrderItemRevenues matches allocateOrderDiscount to the exact dinar", () => {
    const lines = [
      { id: "a", unitPrice: 2500, quantity: 1, total: 2500 },
      { id: "b", unitPrice: 5000, quantity: 1, total: 5000 },
      { id: "c", unitPrice: 3000, quantity: 1, total: 3000 },
    ];
    const discount = 1000;
    const shares = allocateOrderDiscount(lines, discount);
    const nets = netOrderItemRevenues(lines, discount);
    expect(nets).toEqual(lines.map((l) => l.total - (shares.get(l.id) ?? 0)));
    expect(nets.reduce((s, n) => s + n, 0)).toBe(2500 + 5000 + 3000 - discount);
    expect(netOrderItemRevenues(lines, 0)).toEqual([2500, 5000, 3000]);
  });

  it("buildTopProducts subtracts bundle discount so product revenue matches net order goods value", () => {
    const top = analyticsService.buildTopProducts([
      {
        status: "delivered",
        discountDzd: 500,
        items: [
          { id: "i1", productId: "p1", productName: "Bundle Oil", quantity: 2, total: 6000 },
        ],
      },
      {
        status: "confirmed",
        discountDzd: 1000,
        items: [
          { id: "i2", productId: "p1", productName: "Bundle Oil", quantity: 1, total: 3000 },
          { id: "i3", productId: "p2", productName: "Soap", quantity: 1, total: 1000 },
        ],
      },
    ]);
    const p1 = top.find((t) => t.key === "p1")!;
    const p2 = top.find((t) => t.key === "p2")!;
    expect(p1.revenue).toBe(5500 + 2250);
    expect(p2.revenue).toBe(750);
    expect(p1.revenue + p2.revenue).toBe(6000 + 3000 + 1000 - 1500);
  });

  it("productServiceExtensions.getStats deducts pro-rata discount from single-product revenue in real SQLite", async () => {
    const cat = await seedCategory(db);
    const customer = await seedCustomer(db, { phone: "0550112233" });
    const pA = await seedProduct(db, { name: "Argan Bundle", price: 3000, stock: 20, categoryId: cat.id });
    const pB = await seedProduct(db, { name: "Rose Water", price: 1000, stock: 20, categoryId: cat.id });

    await db.order.create({
      data: {
        orderNumber: "ORD-F0067-1",
        status: "delivered",
        customerId: customer.id,
        totalPrice: 7700,
        deliveryCost: 500,
        discountDzd: 800,
        wilaya: "16",
        commune: "Alger",
        address: "Rue Didouche",
        phone: "0550112233",
        source: "storefront",
        items: {
          create: [
            { productId: pA.id, productName: pA.name, quantity: 2, unitPrice: 3000, total: 6000 },
            { productId: pB.id, productName: pB.name, quantity: 2, unitPrice: 1000, total: 2000 },
          ],
        },
      },
    });

    const statsA = await productServiceExtensions.getStats({ prisma: db as never }, pA.id);
    const statsB = await productServiceExtensions.getStats({ prisma: db as never }, pB.id);
    expect(statsA.revenue).toBe(5400);
    expect(statsB.revenue).toBe(1800);
    expect(statsA.revenue + statsB.revenue).toBe(8000 - 800);
  });
});
