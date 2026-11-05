/**
 * Stats service tests — getDashboard aggregation.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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

/*
 * F-0048: the trend must compare today SO FAR with the SAME HOURS of yesterday. It compared with the WHOLE of
 * yesterday, so every morning after a busy day showed a red negative percentage, and a missing baseline gave 0.
 * Fixed clock: 5 Nov 2026 10:00 UTC = 11:00 in Algeria (UTC+1, no daylight saving). The shop day starts at 23:00 UTC.
 */
describe("statsService.getDashboard trends (F-0048)", () => {
  const NOW = new Date("2026-11-05T10:00:00.000Z");
  let sequence = 0;

  async function orderAt(createdAt: string, customerId: string) {
    sequence += 1;
    await db.order.create({
      data: {
        orderNumber: `TRD-${String(sequence).padStart(4, "0")}`, status: "pending", customerId,
        totalPrice: 1000, wilaya: "A", commune: "B", address: "C", phone: "0555123456", source: "manual",
        createdAt: new Date(createdAt),
      },
    });
  }

  beforeEach(() => {
    sequence = 0;
    // Only Date is faked: Prisma needs the real timers.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => { vi.useRealTimers(); });

  it("compares with the same hours of yesterday, not the whole day", async () => {
    const customer = await seedCustomer(db, { phone: uniquePhone() });
    await orderAt("2026-11-05T08:00:00.000Z", customer.id); // today, before now
    await orderAt("2026-11-04T08:00:00.000Z", customer.id); // yesterday, same hours (before 11:00 shop time)
    await orderAt("2026-11-04T18:00:00.000Z", customer.id); // yesterday evening: after the same hour
    await orderAt("2026-11-04T19:00:00.000Z", customer.id); // yesterday evening
    const stats = await statsService.getDashboard({ prisma: db as never });
    expect(stats.ordersToday).toBe(1);
    expect(stats.ordersTrend).toBe(0); // 1 against 1; the old rule said -67 (1 against 3)
  });

  it("is a dash (null), not 0, when yesterday had nothing to compare", async () => {
    const customer = await seedCustomer(db, { phone: uniquePhone() });
    await orderAt("2026-11-05T08:00:00.000Z", customer.id);
    await orderAt("2026-11-05T09:00:00.000Z", customer.id);
    const stats = await statsService.getDashboard({ prisma: db as never });
    expect(stats.ordersToday).toBe(2);
    expect(stats.ordersTrend).toBeNull();
  });

  it("never shows -100 % at the start of a day after a busy evening", async () => {
    const customer = await seedCustomer(db, { phone: uniquePhone() });
    await orderAt("2026-11-04T18:00:00.000Z", customer.id); // yesterday evening only
    await orderAt("2026-11-04T19:00:00.000Z", customer.id);
    const stats = await statsService.getDashboard({ prisma: db as never });
    expect(stats.ordersToday).toBe(0);
    expect(stats.ordersTrend).toBe(0); // 0 against 0 in the same hours; the old rule said -100
  });
});
