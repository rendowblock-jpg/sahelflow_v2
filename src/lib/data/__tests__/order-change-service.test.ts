import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

const { dispatchTrigger } = vi.hoisted(() => ({
  dispatchTrigger: vi.fn(async () => {}),
}));

vi.mock("@/lib/automations/engine", () => ({
  dispatchTrigger,
  dispatchLowStock: vi.fn(async () => {}),
  detectLowStock: vi.fn(async () => null),
}));

import {
  recordOrderChangeInTx,
  type OrderChangeTransactionClient,
} from "@/lib/data/order-change-service";
import { orderService } from "@/lib/data/order-service";
import {
  createTestPrisma,
  disconnectTestPrisma,
  seedCustomer,
  seedProduct,
} from "@/lib/data/__tests__/helpers";

let db: PrismaClient;

beforeEach(async () => {
  db = await createTestPrisma();
  await db.$executeRawUnsafe('DROP TRIGGER IF EXISTS "fail_order_status_ledger"');
  await db.$executeRawUnsafe('DROP TRIGGER IF EXISTS "fail_order_customer_projection"');
  dispatchTrigger.mockClear();
});

afterEach(async () => {
  await db.$executeRawUnsafe('DROP TRIGGER IF EXISTS "fail_order_status_ledger"');
  await db.$executeRawUnsafe('DROP TRIGGER IF EXISTS "fail_order_customer_projection"');
  await disconnectTestPrisma(db);
});

describe("recordOrderChangeInTx", () => {
  it("uses the caller transaction and propagates ledger failures", async () => {
    const failure = new Error("ledger write failed");
    const create = vi.fn().mockRejectedValue(failure);
    const tx = {
      orderChange: { create },
    } as unknown as OrderChangeTransactionClient;

    await expect(recordOrderChangeInTx(tx, {
      orderId: "order-1",
      actionType: "status_change",
      payload: { from: "shipped", to: "delivered" },
    })).rejects.toBe(failure);

    expect(create).toHaveBeenCalledOnce();
  });

  it("rolls back the business mutation when the ledger insert fails", async () => {
    const customer = await seedCustomer(db);
    const product = await seedProduct(db, { stock: 10 });
    const order = await db.order.create({
      data: {
        orderNumber: "ORD-ROLLBACK-1",
        status: "pending",
        customerId: customer.id,
        totalPrice: 2000,
        wilaya: "Alger",
        commune: "Alger",
        address: "Test",
        phone: "0555000000",
        source: "manual",
        items: {
          create: [{
            productId: product.id,
            productName: product.name,
            quantity: 2,
            unitPrice: 1000,
            total: 2000,
          }],
        },
      },
    });
    await db.$executeRawUnsafe(`
      CREATE TRIGGER "fail_order_status_ledger"
      BEFORE INSERT ON "OrderChange"
      WHEN NEW.actionType = 'status_change'
      BEGIN
        SELECT RAISE(ABORT, 'forced ledger failure');
      END
    `);

    await expect(orderService.updateStatus(
      { prisma: db as never },
      order.id,
      "confirmed",
    )).rejects.toThrow();

    expect((await db.order.findUnique({ where: { id: order.id } }))?.status).toBe("pending");
    expect((await db.product.findUnique({ where: { id: product.id } }))?.stock).toBe(10);
    expect(await db.orderChange.count({ where: { orderId: order.id } })).toBe(0);
  });

  it("rolls back status when the required customer projection fails", async () => {
    const customer = await seedCustomer(db);
    const order = await db.order.create({
      data: {
        orderNumber: "ORD-CUSTOMER-PROJECTION-1",
        status: "shipped",
        customerId: customer.id,
        totalPrice: 2000,
        wilaya: "Alger",
        commune: "Alger",
        address: "Test",
        phone: "0555000000",
        source: "manual",
      },
    });
    await db.$executeRawUnsafe(`
      CREATE TRIGGER "fail_order_customer_projection"
      BEFORE UPDATE OF totalSpent ON "Customer"
      BEGIN
        SELECT RAISE(ABORT, 'forced customer projection failure');
      END
    `);

    await expect(orderService.updateStatus(
      { prisma: db as never },
      order.id,
      "delivered",
    )).rejects.toThrow();

    expect((await db.order.findUnique({ where: { id: order.id } }))?.status).toBe("shipped");
    expect(await db.customer.findUnique({ where: { id: customer.id } }))
      .toMatchObject({ orderCount: 0, totalSpent: 0 });
    expect(await db.orderChange.count({ where: { orderId: order.id } })).toBe(0);
  });

  it("dispatches a caller-owned creation only after the outer transaction commits", async () => {
    const customer = await seedCustomer(db);
    const afterCommit: Array<() => void> = [];
    let release!: () => void;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    let ready!: () => void;
    const transactionReady = new Promise<void>((resolve) => {
      ready = resolve;
    });

    const transaction = db.$transaction(async (tx) => {
      await orderService.create(
        { prisma: db as never },
        {
          customerId: customer.id,
          items: [{ productName: "Test", quantity: 1, unitPrice: 1000 }],
          wilaya: "Alger",
          commune: "Alger",
          address: "Test",
          phone: "0555000000",
          source: "manual",
        },
        {
          tx: tx as never,
          afterCommit: (effect) => afterCommit.push(effect),
        },
      );
      expect(dispatchTrigger).not.toHaveBeenCalled();
      ready();
      await hold;
    });

    await transactionReady;
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(dispatchTrigger).not.toHaveBeenCalled();
    release();
    await transaction;
    expect(dispatchTrigger).not.toHaveBeenCalled();
    afterCommit.forEach((effect) => effect());
    expect(dispatchTrigger).toHaveBeenCalledOnce();
  });

  it("never dispatches automation when the outer transaction rolls back", async () => {
    const customer = await seedCustomer(db);
    const afterCommit: Array<() => void> = [];

    await expect(db.$transaction(async (tx) => {
      await orderService.create(
        { prisma: db as never },
        {
          customerId: customer.id,
          items: [{ productName: "Test", quantity: 1, unitPrice: 1000 }],
          wilaya: "Alger",
          commune: "Alger",
          address: "Test",
          phone: "0555000000",
          source: "manual",
        },
        {
          tx: tx as never,
          afterCommit: (effect) => afterCommit.push(effect),
        },
      );
      throw new Error("force outer rollback");
    })).rejects.toThrow("force outer rollback");

    expect(afterCommit).toHaveLength(1);
    expect(dispatchTrigger).not.toHaveBeenCalled();
    expect(await db.order.count()).toBe(0);
    expect(await db.orderChange.count()).toBe(0);
  });
});
