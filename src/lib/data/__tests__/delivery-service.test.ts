/**
 * Delivery service tests — CRUD + status updates.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { deliveryService } from "../delivery-service";
import { createTestPrisma, disconnectTestPrisma, seedCustomer, uniquePhone } from "./helpers";
import { NotFoundError } from "@/types/errors";

let db: PrismaClient;

beforeEach(async () => {
  db = await createTestPrisma();
});

afterEach(async () => {
  await disconnectTestPrisma(db);
});

async function createOrder() {
  const customer = await seedCustomer(db, { phone: uniquePhone() });
  return db.order.create({
    data: {
      orderNumber: `ORD-${String(Math.floor(Math.random() * 100000)).padStart(5, "0")}`,
      status: "confirmed", customerId: customer.id,
      totalPrice: 1000, wilaya: "Alger", commune: "Bab Ezzouar", address: "123",
      phone: "0555123456", source: "manual",
    },
  });
}

describe("deliveryService.list", () => {
  it("returns empty array when no deliveries", async () => {
    const result = await deliveryService.list({ prisma: db as never });
    expect(result).toEqual([]);
  });

  it("returns deliveries", async () => {
    const order = await createOrder();
    await db.delivery.create({
      data: { orderId: order.id, provider: "yalidine", status: "pending" },
    });
    const result = await deliveryService.list({ prisma: db as never });
    expect(result).toHaveLength(1);
  });
});

describe("deliveryService.getById", () => {
  it("returns delivery by id", async () => {
    const order = await createOrder();
    const delivery = await db.delivery.create({
      data: { orderId: order.id, provider: "yalidine", status: "pending" },
    });
    const found = await deliveryService.getById({ prisma: db as never }, delivery.id);
    expect(found.provider).toBe("yalidine");
  });

  it("throws NotFoundError for non-existent id", async () => {
    await expect(
      deliveryService.getById({ prisma: db as never }, "nonexistent123456789012345"),
    ).rejects.toThrow(NotFoundError);
  });
});

describe("deliveryService.getByOrderId", () => {
  it("returns delivery by order id", async () => {
    const order = await createOrder();
    await db.delivery.create({
      data: { orderId: order.id, provider: "yalidine", status: "pending" },
    });
    const found = await deliveryService.getByOrderId({ prisma: db as never }, order.id);
    expect(found).not.toBeNull();
  });

  it("returns null when no delivery for order", async () => {
    const order = await createOrder();
    const found = await deliveryService.getByOrderId({ prisma: db as never }, order.id);
    expect(found).toBeNull();
  });
});

// (Phase 5) deliveryService.create + deliveryService.updateStatus tests
// removed — the methods were dead production code (only called from this
// file). The write paths are now covered by:
//   - src/app/api/__tests__/delivery.test.ts       (POST /api/delivery/create, POST /api/delivery/sync)
//   - src/app/api/__tests__/delivery-patch.test.ts (PATCH /api/delivery/[id])

describe("deliveryService.listActive", () => {
  it("returns only active (non-terminal) deliveries", async () => {
    const order1 = await createOrder();
    const order2 = await createOrder();
    await db.delivery.create({
      data: { orderId: order1.id, provider: "yalidine", status: "in_transit" },
    });
    await db.delivery.create({
      data: { orderId: order2.id, provider: "yalidine", status: "delivered" },
    });
    const result = await deliveryService.listActive({ prisma: db as never });
    expect(result).toHaveLength(1);
    expect(result[0]!.status).toBe("in_transit");
  });
});
