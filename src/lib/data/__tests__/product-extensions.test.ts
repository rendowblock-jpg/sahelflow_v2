/**
 * Product extensions tests — search + getStats.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { productServiceExtensions } from "@/lib/data/extensions/product-extensions";
import { createTestPrisma, disconnectTestPrisma, seedProduct, seedCategory, seedCustomer } from "./helpers";

let db: PrismaClient;

beforeEach(async () => { db = await createTestPrisma(); });
afterEach(async () => { await disconnectTestPrisma(db); });

describe("productServiceExtensions.search", () => {
  it("finds products by partial name match", async () => {
    const cat = await seedCategory(db);
    await seedProduct(db, { name: "Widget Pro", categoryId: cat.id });
    await seedProduct(db, { name: "Gadget Max", categoryId: cat.id });
    const rows = await productServiceExtensions.search({ prisma: db as never }, "Widget");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.name).toBe("Widget Pro");
  });

  it("filters to active only when activeOnly=true", async () => {
    const cat = await seedCategory(db);
    await seedProduct(db, { name: "Active Product", categoryId: cat.id });
    await db.product.create({
      data: { name: "Inactive Product", price: 1000, stock: 0, categoryId: cat.id, isActive: false },
    });
    const rows = await productServiceExtensions.search({ prisma: db as never }, "Product", { activeOnly: true });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.name).toBe("Active Product");
  });

  it("includes inactive when activeOnly not set", async () => {
    const cat = await seedCategory(db);
    await seedProduct(db, { name: "Active Product", categoryId: cat.id });
    await db.product.create({
      data: { name: "Inactive Product", price: 1000, stock: 0, categoryId: cat.id, isActive: false },
    });
    const rows = await productServiceExtensions.search({ prisma: db as never }, "Product");
    expect(rows).toHaveLength(2);
  });

  it("respects limit + offset", async () => {
    const cat = await seedCategory(db);
    for (let i = 0; i < 5; i++) {
      await seedProduct(db, { name: `Product${i}`, categoryId: cat.id });
    }
    const rows = await productServiceExtensions.search({ prisma: db as never }, "Product", { limit: 2, offset: 1 });
    expect(rows).toHaveLength(2);
  });

  it("returns empty for no matches", async () => {
    await seedProduct(db, { name: "Widget" });
    const rows = await productServiceExtensions.search({ prisma: db as never }, "NONEXISTENT");
    expect(rows).toEqual([]);
  });
});

describe("productServiceExtensions.getStats", () => {
  it("returns zero stats for product with no order items", async () => {
    const product = await seedProduct(db);
    const stats = await productServiceExtensions.getStats({ prisma: db as never }, product.id);
    expect(stats.unitsSold).toBe(0);
    expect(stats.revenue).toBe(0);
    expect(stats.orderCount).toBe(0);
  });

  it("aggregates unitsSold + revenue from order items", async () => {
    const cat = await seedCategory(db);
    const product = await seedProduct(db, { categoryId: cat.id, price: 1000 });
    const customer = await seedCustomer(db);
    // Create 2 orders with items for this product
    await db.order.create({
      data: {
        orderNumber: "ORD-0001", status: "delivered", customerId: customer.id,
        totalPrice: 3000, wilaya: "A", commune: "B", address: "C", phone: "0555123456", source: "manual",
        items: { create: [{ productId: product.id, productName: "Test", quantity: 3, unitPrice: 1000, total: 3000 }] },
      },
    });
    await db.order.create({
      data: {
        orderNumber: "ORD-0002", status: "delivered", customerId: customer.id,
        totalPrice: 2000, wilaya: "A", commune: "B", address: "C", phone: "0555123456", source: "manual",
        items: { create: [{ productId: product.id, productName: "Test", quantity: 2, unitPrice: 1000, total: 2000 }] },
      },
    });
    const stats = await productServiceExtensions.getStats({ prisma: db as never }, product.id);
    expect(stats.unitsSold).toBe(5); // 3 + 2
    expect(stats.revenue).toBe(5000); // 3000 + 2000
    expect(stats.orderCount).toBe(2); // 2 distinct orders
  });
});

// ── Soft-delete exclusion (AUDIT Pattern 5, Session 31) ─────────────────────
describe("productServiceExtensions.search — excludes soft-deleted (AUDIT Pattern 5)", () => {
  it("does not return soft-deleted products", async () => {
    const cat = await seedCategory(db);
    await seedProduct(db, { name: "Widget Pro", categoryId: cat.id });
    const softDeleted = await seedProduct(db, { name: "Widget Lite", categoryId: cat.id });
    await db.product.update({ where: { id: softDeleted.id }, data: { deletedAt: new Date() } });
    const rows = await productServiceExtensions.search({ prisma: db as never }, "Widget");
    expect(rows).toHaveLength(1); // soft-deleted "Widget Lite" excluded
    expect(rows[0]!.name).toBe("Widget Pro");
  });
});
