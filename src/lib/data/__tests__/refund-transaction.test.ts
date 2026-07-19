import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => {}) }));

import { createRefund, reverseRefund } from "@/lib/data/refund-service";
import {
  createTestPrisma,
  disconnectTestPrisma,
  seedCustomer,
  seedProduct,
} from "@/lib/data/__tests__/helpers";

let db: PrismaClient;

beforeEach(async () => {
  db = await createTestPrisma();
  await db.$executeRawUnsafe('DROP TRIGGER IF EXISTS "fail_refund_ledger"');
  await db.$executeRawUnsafe('DROP TRIGGER IF EXISTS "fail_customer_refund_projection"');
});

afterEach(async () => {
  await db.$executeRawUnsafe('DROP TRIGGER IF EXISTS "fail_refund_ledger"');
  await db.$executeRawUnsafe('DROP TRIGGER IF EXISTS "fail_customer_refund_projection"');
  await disconnectTestPrisma(db);
});

async function seedDeliveredOrder() {
  const customer = await seedCustomer(db);
  await db.customer.update({
    where: { id: customer.id },
    data: { orderCount: 1, totalSpent: 5000 },
  });
  const product = await seedProduct(db, { stock: 98 });
  const order = await db.order.create({
    data: {
      orderNumber: "ORD-REFUND-TX-1",
      status: "delivered",
      customerId: customer.id,
      totalPrice: 5000,
      wilaya: "Alger",
      commune: "Alger",
      address: "Test",
      phone: customer.phone,
      source: "manual",
      deliveredAt: new Date(),
      items: {
        create: [{
          productId: product.id,
          productName: product.name,
          quantity: 2,
          unitPrice: 2500,
          total: 5000,
        }],
      },
    },
  });
  return { customer, product, order };
}

describe("refund transaction facts", () => {
  it("applies every direct partial refund and reverses by refund identity", async () => {
    const { customer, product, order } = await seedDeliveredOrder();
    const first = await createRefund({ prisma: db as never }, {
      orderId: order.id,
      amount: 2000,
      method: "cash",
      idempotencyKey: "refund-partial-1",
    });
    const second = await createRefund({ prisma: db as never }, {
      orderId: order.id,
      amount: 3000,
      method: "cash",
      idempotencyKey: "refund-partial-2",
    });
    const sameTimestamp = new Date("2026-07-19T12:00:00.000Z");
    await db.orderChange.updateMany({
      where: { orderId: order.id, actionType: "refund" },
      data: { createdAt: sameTimestamp },
    });

    expect(await db.customer.findUnique({ where: { id: customer.id } }))
      .toMatchObject({ orderCount: 0, totalSpent: 0 });
    expect((await db.product.findUnique({ where: { id: product.id } }))?.stock).toBe(100);

    await expect(reverseRefund({ prisma: db as never }, first.id))
      .rejects.toThrow(/other active refunds/i);
    await reverseRefund({ prisma: db as never }, second.id);
    expect(await db.customer.findUnique({ where: { id: customer.id } }))
      .toMatchObject({ orderCount: 0, totalSpent: 3000 });
    expect((await db.order.findUnique({ where: { id: order.id } }))?.status).toBe("returned");
    expect((await db.product.findUnique({ where: { id: product.id } }))?.stock).toBe(100);

    await reverseRefund({ prisma: db as never }, first.id);
    expect(await db.customer.findUnique({ where: { id: customer.id } }))
      .toMatchObject({ orderCount: 1, totalSpent: 5000 });
    expect((await db.order.findUnique({ where: { id: order.id } }))?.status).toBe("delivered");
    expect((await db.product.findUnique({ where: { id: product.id } }))?.stock).toBe(98);
  });

  it("rolls back refund, status, stock, and projections when the ledger fails", async () => {
    const { customer, product, order } = await seedDeliveredOrder();
    await db.$executeRawUnsafe(`
      CREATE TRIGGER "fail_refund_ledger"
      BEFORE INSERT ON "OrderChange"
      WHEN NEW.actionType = 'refund'
      BEGIN
        SELECT RAISE(ABORT, 'forced ledger failure');
      END
    `);

    await expect(createRefund({ prisma: db as never }, {
      orderId: order.id,
      amount: 5000,
      method: "cash",
      idempotencyKey: "refund-ledger-failure",
    })).rejects.toThrow();

    expect(await db.refund.count({ where: { orderId: order.id } })).toBe(0);
    expect(await db.orderChange.count({ where: { orderId: order.id } })).toBe(0);
    expect((await db.order.findUnique({ where: { id: order.id } }))?.status).toBe("delivered");
    expect((await db.product.findUnique({ where: { id: product.id } }))?.stock).toBe(98);
    expect(await db.customer.findUnique({ where: { id: customer.id } }))
      .toMatchObject({ orderCount: 1, totalSpent: 5000 });
  });

  it("rolls back when the required customer projection fails", async () => {
    const { customer, product, order } = await seedDeliveredOrder();
    await db.$executeRawUnsafe(`
      CREATE TRIGGER "fail_customer_refund_projection"
      BEFORE UPDATE OF totalSpent ON "Customer"
      BEGIN
        SELECT RAISE(ABORT, 'forced customer projection failure');
      END
    `);

    await expect(createRefund({ prisma: db as never }, {
      orderId: order.id,
      amount: 2000,
      method: "cash",
      idempotencyKey: "refund-customer-projection-failure",
    })).rejects.toThrow();

    expect(await db.refund.count({ where: { orderId: order.id } })).toBe(0);
    expect(await db.orderChange.count({ where: { orderId: order.id } })).toBe(0);
    expect((await db.order.findUnique({ where: { id: order.id } }))?.status).toBe("delivered");
    expect((await db.product.findUnique({ where: { id: product.id } }))?.stock).toBe(98);
    expect(await db.customer.findUnique({ where: { id: customer.id } }))
      .toMatchObject({ orderCount: 1, totalSpent: 5000 });
  });
});
