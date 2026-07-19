import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { bulkMarkCodRemitted } from "@/lib/data/cod-service";
import {
  createTestPrisma,
  disconnectTestPrisma,
  seedCustomer,
} from "@/lib/data/__tests__/helpers";

let db: PrismaClient;

beforeEach(async () => {
  db = await createTestPrisma();
  await db.$executeRawUnsafe('DROP TRIGGER IF EXISTS "fail_bulk_cod_ledger"');
});

afterEach(async () => {
  await db.$executeRawUnsafe('DROP TRIGGER IF EXISTS "fail_bulk_cod_ledger"');
  await disconnectTestPrisma(db);
});

async function seedCollectedOrder(orderNumber: string, totalPrice: number) {
  const customer = await seedCustomer(db, { phone: `0555${orderNumber.slice(-6)}` });
  return db.order.create({
    data: {
      orderNumber,
      status: "delivered",
      customerId: customer.id,
      totalPrice,
      wilaya: "Alger",
      commune: "Alger",
      address: "Test",
      phone: customer.phone,
      source: "manual",
      codCollected: true,
      codRemitted: false,
    },
  });
}

describe("bulk COD transaction", () => {
  it("writes exact amounts and remains idempotent", async () => {
    const first = await seedCollectedOrder("ORD-COD-000001", 5000);
    const second = await seedCollectedOrder("ORD-COD-000002", 3200);

    await expect(bulkMarkCodRemitted(
      { prisma: db as never },
      [first.id, second.id],
      "REM-1",
    )).resolves.toEqual({ updated: 2, total: 2 });
    await expect(bulkMarkCodRemitted(
      { prisma: db as never },
      [first.id, second.id],
      "REM-2",
    )).resolves.toEqual({ updated: 0, total: 2 });

    const changes = await db.orderChange.findMany({
      where: { actionType: "cod_remitted" },
      orderBy: { orderId: "asc" },
    });
    expect(changes).toHaveLength(2);
    expect(changes.map((change) => JSON.parse(change.payload ?? "{}").amount).sort())
      .toEqual([3200, 5000]);
    expect((await db.order.findUnique({ where: { id: first.id } }))?.codRemittanceRef)
      .toBe("REM-1");
  });

  it("claims each order once across concurrent bulk attempts", async () => {
    const first = await seedCollectedOrder("ORD-COD-000005", 5100);
    const second = await seedCollectedOrder("ORD-COD-000006", 3300);

    const results = await Promise.all([
      bulkMarkCodRemitted(
        { prisma: db as never },
        [first.id, second.id],
        "REM-CONCURRENT-A",
      ),
      bulkMarkCodRemitted(
        { prisma: db as never },
        [first.id, second.id],
        "REM-CONCURRENT-B",
      ),
    ]);

    expect(results.reduce((sum, result) => sum + result.updated, 0)).toBe(2);
    const changes = await db.orderChange.findMany({
      where: { actionType: "cod_remitted" },
    });
    expect(changes).toHaveLength(2);
    expect(changes.map((change) => JSON.parse(change.payload ?? "{}").amount).sort())
      .toEqual([3300, 5100]);
  });

  it("rolls back every remittance when a strict ledger insert fails", async () => {
    const first = await seedCollectedOrder("ORD-COD-000003", 5000);
    const second = await seedCollectedOrder("ORD-COD-000004", 3200);
    await db.$executeRawUnsafe(`
      CREATE TRIGGER "fail_bulk_cod_ledger"
      BEFORE INSERT ON "OrderChange"
      WHEN NEW.actionType = 'cod_remitted'
      BEGIN
        SELECT RAISE(ABORT, 'forced ledger failure');
      END
    `);

    await expect(bulkMarkCodRemitted(
      { prisma: db as never },
      [first.id, second.id],
      "REM-FAIL",
    )).rejects.toThrow();

    const orders = await db.order.findMany({ where: { id: { in: [first.id, second.id] } } });
    expect(orders.every((order) => order.codRemitted === false)).toBe(true);
    expect(orders.every((order) => order.codRemittanceRef === null)).toBe(true);
    expect(await db.orderChange.count({ where: { actionType: "cod_remitted" } })).toBe(0);
  });
});
