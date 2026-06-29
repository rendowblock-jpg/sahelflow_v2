/**
 * Order extensions tests — search + countSearch + bulkUpdateStatus.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { orderServiceExtensions } from "@/lib/data/extensions/order-extensions";
import { createTestPrisma, disconnectTestPrisma, seedCustomer, uniquePhone } from "./helpers";

let db: PrismaClient;

beforeEach(async () => { db = await createTestPrisma(); });
afterEach(async () => { await disconnectTestPrisma(db); });

async function createOrder(opts?: { status?: string; totalPrice?: number; phone?: string; wilaya?: string; orderNumber?: string }) {
  const customer = await seedCustomer(db, { phone: uniquePhone() });
  return db.order.create({
    data: {
      orderNumber: opts?.orderNumber ?? `ORD-${String(Math.floor(Math.random() * 10000)).padStart(4, "0")}`,
      status: opts?.status ?? "pending",
      customerId: customer.id,
      totalPrice: opts?.totalPrice ?? 1000,
      wilaya: opts?.wilaya ?? "Alger",
      commune: "Bab Ezzouar",
      address: "123 Rue",
      phone: opts?.phone ?? "0555123456",
      source: "manual",
    },
  });
}

describe("orderServiceExtensions.search", () => {
  it("finds orders by orderNumber partial match", async () => {
    await createOrder({ orderNumber: "ORD-0001" });
    await createOrder({ orderNumber: "ORD-0002" });
    const rows = await orderServiceExtensions.search({ prisma: db as never }, "ORD-0001");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.orderNumber).toBe("ORD-0001");
  });

  it("finds orders by phone", async () => {
    await createOrder({ phone: "0555111222" });
    await createOrder({ phone: "0666333444" });
    const rows = await orderServiceExtensions.search({ prisma: db as never }, "0555");
    expect(rows).toHaveLength(1);
  });

  it("finds orders by wilaya", async () => {
    await createOrder({ wilaya: "Oran" });
    await createOrder({ wilaya: "Alger" });
    const rows = await orderServiceExtensions.search({ prisma: db as never }, "Oran");
    expect(rows).toHaveLength(1);
  });

  it("filters by status when provided", async () => {
    await createOrder({ status: "pending", orderNumber: "ORD-0001" });
    await createOrder({ status: "confirmed", orderNumber: "ORD-0002" });
    const rows = await orderServiceExtensions.search({ prisma: db as never }, "ORD", { status: "pending" });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("pending");
  });

  it("respects limit + offset", async () => {
    for (let i = 0; i < 5; i++) {
      await createOrder({ orderNumber: `ORD-${String(i + 1).padStart(4, "0")}` });
    }
    const rows = await orderServiceExtensions.search({ prisma: db as never }, "ORD", { limit: 2, offset: 1 });
    expect(rows).toHaveLength(2);
  });

  it("returns empty array for no matches", async () => {
    await createOrder();
    const rows = await orderServiceExtensions.search({ prisma: db as never }, "NONEXISTENT");
    expect(rows).toEqual([]);
  });
});

describe("orderServiceExtensions.countSearch", () => {
  it("counts matching orders", async () => {
    await createOrder({ orderNumber: "ORD-0001" });
    await createOrder({ orderNumber: "ORD-0002" });
    await createOrder({ orderNumber: "ORD-0003" });
    const count = await orderServiceExtensions.countSearch({ prisma: db as never }, "ORD-000");
    expect(count).toBe(3);
  });

  it("returns 0 for empty query", async () => {
    await createOrder({ orderNumber: "ORD-0001" });
    await createOrder({ orderNumber: "ORD-0002" });
    const count = await orderServiceExtensions.countSearch({ prisma: db as never }, "");
    expect(count).toBe(0);
  });
});

describe("orderServiceExtensions.bulkUpdateStatus", () => {
  it("transitions all valid orders", async () => {
    const o1 = await createOrder({ status: "draft" });
    const o2 = await createOrder({ status: "draft" });
    const result = await orderServiceExtensions.bulkUpdateStatus(
      { prisma: db as never },
      [o1.id, o2.id],
      "pending",
    );
    expect(result.succeeded).toHaveLength(2);
    expect(result.failed).toHaveLength(0);
  });

  it("reports failed orders individually", async () => {
    const o1 = await createOrder({ status: "draft" });
    const result = await orderServiceExtensions.bulkUpdateStatus(
      { prisma: db as never },
      [o1.id, "cnonexistent123456789012"],
      "pending",
    );
    expect(result.succeeded).toHaveLength(1);
    expect(result.failed).toHaveLength(1);
  });

  it("reports invalid transitions as failures", async () => {
    // draft → delivered is invalid
    const o1 = await createOrder({ status: "draft" });
    const result = await orderServiceExtensions.bulkUpdateStatus(
      { prisma: db as never },
      [o1.id],
      "delivered",
    );
    expect(result.succeeded).toHaveLength(0);
    expect(result.failed).toHaveLength(1);
  });
});
