/**
 * Customer extensions tests — search + getStats + getOrderHistory.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { customerServiceExtensions } from "@/lib/data/extensions/customer-extensions";
import { createTestPrisma, disconnectTestPrisma, seedCustomer, uniquePhone } from "./helpers";

let db: PrismaClient;

beforeEach(async () => { db = await createTestPrisma(); });
afterEach(async () => { await disconnectTestPrisma(db); });

describe("customerServiceExtensions.search", () => {
  it("returns empty array for empty query", async () => {
    await seedCustomer(db, { phone: uniquePhone() });
    const rows = await customerServiceExtensions.search({ prisma: db as never }, "");
    expect(rows).toEqual([]);
  });

  it("returns empty array for whitespace-only query", async () => {
    await seedCustomer(db, { phone: uniquePhone() });
    const rows = await customerServiceExtensions.search({ prisma: db as never }, "   ");
    expect(rows).toEqual([]);
  });

  it("finds customers by partial name match", async () => {
    await seedCustomer(db, { name: "Ahmed Benali", phone: uniquePhone() });
    await seedCustomer(db, { name: "Fatima Zahra", phone: uniquePhone() });
    const rows = await customerServiceExtensions.search({ prisma: db as never }, "ahmed");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.name).toBe("Ahmed Benali");
  });

  it("finds customers by partial phone match", async () => {
    await seedCustomer(db, { name: "C1", phone: "0555111222" });
    await seedCustomer(db, { name: "C2", phone: "0666333444" });
    const rows = await customerServiceExtensions.search({ prisma: db as never }, "0555");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.name).toBe("C1");
  });

  it("respects limit + offset", async () => {
    for (let i = 0; i < 5; i++) {
      await seedCustomer(db, { name: `Customer${i}`, phone: uniquePhone() });
    }
    const rows = await customerServiceExtensions.search({ prisma: db as never }, "Customer", { limit: 2, offset: 1 });
    expect(rows).toHaveLength(2);
  });
});

describe("customerServiceExtensions.getStats", () => {
  it("returns zero stats for customer with no orders", async () => {
    const customer = await seedCustomer(db, { phone: uniquePhone() });
    const stats = await customerServiceExtensions.getStats({ prisma: db as never }, customer.id);
    expect(stats.totalOrders).toBe(0);
    expect(stats.totalSpent).toBe(0);
    expect(stats.deliveredCount).toBe(0);
    expect(stats.returnedCount).toBe(0);
    expect(stats.deliveryRate).toBe(0);
    expect(stats.avgOrderValue).toBe(0);
    expect(stats.firstOrderDate).toBeNull();
    expect(stats.lastOrderDate).toBeNull();
  });

  it("computes totalOrders = count of all orders", async () => {
    const customer = await seedCustomer(db, { phone: uniquePhone() });
    for (let i = 0; i < 3; i++) {
      await db.order.create({
        data: {
          orderNumber: `ORD-${String(i + 1).padStart(4, "0")}`, status: "delivered",
          customerId: customer.id, totalPrice: 1000, wilaya: "A", commune: "B", address: "C",
          phone: "0555123456", source: "manual",
        },
      });
    }
    const stats = await customerServiceExtensions.getStats({ prisma: db as never }, customer.id);
    expect(stats.totalOrders).toBe(3);
  });

  it("computes totalSpent excluding cancelled + draft", async () => {
    const customer = await seedCustomer(db, { phone: uniquePhone() });
    // delivered: 2000 counts
    await db.order.create({
      data: { orderNumber: "ORD-0001", status: "delivered", customerId: customer.id, totalPrice: 2000, wilaya: "A", commune: "B", address: "C", phone: "0555123456", source: "manual" },
    });
    // cancelled: 5000 does NOT count
    await db.order.create({
      data: { orderNumber: "ORD-0002", status: "cancelled", customerId: customer.id, totalPrice: 5000, wilaya: "A", commune: "B", address: "C", phone: "0555123456", source: "manual" },
    });
    // draft: 3000 does NOT count
    await db.order.create({
      data: { orderNumber: "ORD-0003", status: "draft", customerId: customer.id, totalPrice: 3000, wilaya: "A", commune: "B", address: "C", phone: "0555123456", source: "manual" },
    });
    const stats = await customerServiceExtensions.getStats({ prisma: db as never }, customer.id);
    expect(stats.totalSpent).toBe(2000);
  });

  it("computes deliveryRate = delivered / completed", async () => {
    const customer = await seedCustomer(db, { phone: uniquePhone() });
    // 3 delivered, 1 returned, 1 refused → 3/5 = 60%
    for (const [i, status] of ["delivered", "delivered", "delivered", "returned", "refused"]!.entries()) {
      await db.order.create({
        data: { orderNumber: `ORD-${String(i + 1).padStart(4, "0")}`, status, customerId: customer.id, totalPrice: 1000, wilaya: "A", commune: "B", address: "C", phone: "0555123456", source: "manual" },
      });
    }
    const stats = await customerServiceExtensions.getStats({ prisma: db as never }, customer.id);
    expect(stats.deliveredCount).toBe(3);
    expect(stats.returnedCount).toBe(2); // returned + refused
    expect(stats.deliveryRate).toBe(60);
  });

  it("sets firstOrderDate + lastOrderDate", async () => {
    const customer = await seedCustomer(db, { phone: uniquePhone() });
    const date1 = new Date("2025-01-01");
    const date2 = new Date("2025-06-01");
    await db.order.create({
      data: { orderNumber: "ORD-0001", status: "delivered", customerId: customer.id, totalPrice: 1000, wilaya: "A", commune: "B", address: "C", phone: "0555123456", source: "manual", createdAt: date1 },
    });
    await db.order.create({
      data: { orderNumber: "ORD-0002", status: "delivered", customerId: customer.id, totalPrice: 1000, wilaya: "A", commune: "B", address: "C", phone: "0555123456", source: "manual", createdAt: date2 },
    });
    const stats = await customerServiceExtensions.getStats({ prisma: db as never }, customer.id);
    expect(stats.firstOrderDate).toEqual(date1);
    expect(stats.lastOrderDate).toEqual(date2);
  });
});

describe("customerServiceExtensions.getOrderHistory", () => {
  it("returns orders for a customer", async () => {
    const customer = await seedCustomer(db, { phone: uniquePhone() });
    await db.order.create({
      data: { orderNumber: "ORD-0001", status: "delivered", customerId: customer.id, totalPrice: 1000, wilaya: "A", commune: "B", address: "C", phone: "0555123456", source: "manual" },
    });
    const orders = await customerServiceExtensions.getOrderHistory({ prisma: db as never }, customer.id);
    expect(orders).toHaveLength(1);
  });

  it("returns empty array for customer with no orders", async () => {
    const customer = await seedCustomer(db, { phone: uniquePhone() });
    const orders = await customerServiceExtensions.getOrderHistory({ prisma: db as never }, customer.id);
    expect(orders).toEqual([]);
  });
});
