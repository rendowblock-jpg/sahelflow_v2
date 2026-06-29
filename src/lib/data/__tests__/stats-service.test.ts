/**
 * Stats service tests — getDashboard aggregation.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { statsService } from "@/lib/data/stats-service";
import { createTestPrisma, disconnectTestPrisma, seedCustomer, seedProduct, seedCategory, uniquePhone } from "./helpers";

let db: PrismaClient;

beforeEach(async () => { db = await createTestPrisma(); });
afterEach(async () => { await disconnectTestPrisma(db); });

describe("statsService.getDashboard", () => {
  it("returns zero stats on empty database", async () => {
    const stats = await statsService.getDashboard({ prisma: db as never });
    expect(stats.ordersToday).toBe(0);
    expect(stats.newCustomers).toBe(0);
    expect(stats.revenueToday).toBe(0);
    expect(stats.pendingDeliveries).toBe(0);
    expect(stats.lowStockProducts).toBe(0);
  });

  it("counts orders created today", async () => {
    const customer = await seedCustomer(db, { phone: uniquePhone() });
    await db.order.create({
      data: {
        orderNumber: "ORD-0001", status: "pending", customerId: customer.id,
        totalPrice: 1000, wilaya: "A", commune: "B", address: "C", phone: "0555123456", source: "manual",
      },
    });
    const stats = await statsService.getDashboard({ prisma: db as never });
    expect(stats.ordersToday).toBe(1);
  });

  it("counts new customers today", async () => {
    await seedCustomer(db, { phone: uniquePhone() });
    const stats = await statsService.getDashboard({ prisma: db as never });
    expect(stats.newCustomers).toBe(1);
  });

  it("sums revenueToday for non-cancelled orders", async () => {
    const customer = await seedCustomer(db, { phone: uniquePhone() });
    await db.order.create({
      data: { orderNumber: "ORD-0001", status: "delivered", customerId: customer.id, totalPrice: 2000, wilaya: "A", commune: "B", address: "C", phone: "0555123456", source: "manual" },
    });
    await db.order.create({
      data: { orderNumber: "ORD-0002", status: "cancelled", customerId: customer.id, totalPrice: 5000, wilaya: "A", commune: "B", address: "C", phone: "0555123456", source: "manual" },
    });
    const stats = await statsService.getDashboard({ prisma: db as never });
    expect(stats.revenueToday).toBe(2000);
  });

  it("counts pending deliveries", async () => {
    const customer = await seedCustomer(db, { phone: uniquePhone() });
    const order = await db.order.create({
      data: { orderNumber: "ORD-0001", status: "confirmed", customerId: customer.id, totalPrice: 1000, wilaya: "A", commune: "B", address: "C", phone: "0555123456", source: "manual" },
    });
    await db.delivery.create({
      data: { orderId: order.id, provider: "yalidine", status: "pending" },
    });
    const stats = await statsService.getDashboard({ prisma: db as never });
    expect(stats.pendingDeliveries).toBe(1);
  });

  it("counts low-stock products (stock <= threshold)", async () => {
    const cat = await seedCategory(db);
    await seedProduct(db, { name: "OK", stock: 50, lowStockThreshold: 5, categoryId: cat.id });
    await seedProduct(db, { name: "Low", stock: 3, lowStockThreshold: 5, categoryId: cat.id });
    const stats = await statsService.getDashboard({ prisma: db as never });
    expect(stats.lowStockProducts).toBe(1);
  });
});
