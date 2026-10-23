import type { PrismaClient } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestPrisma, disconnectTestPrisma, seedCustomer, seedOrder, seedProduct } from "@/lib/data/__tests__/helpers";
import { wilayaStoredSpellings } from "@/lib/wilaya-display";

/**
 * The orders list filters with `wilaya IN (spellings)`. This runs that exact condition on real SQLite rows written
 * the three ways an order can hold a wilaya, plus rows that must NOT match (another wilaya, a code that merely
 * contains the digits).
 */
let db: PrismaClient;
let customerId: string;
let productId: string;

beforeEach(async () => {
  db = await createTestPrisma();
  // seedOrder makes a new customer (fixed phone) on every call: seed one and reuse it.
  customerId = (await seedCustomer(db)).id;
  productId = (await seedProduct(db)).id;
});
afterEach(async () => {
  await disconnectTestPrisma(db);
});

async function orderWithWilaya(wilaya: string): Promise<string> {
  const order = await seedOrder(db, { customerId, productId });
  await db.order.update({ where: { id: order.id }, data: { wilaya } });
  return order.orderNumber;
}

describe("orders matched by the spellings of one wilaya", () => {
  it("finds a manual order (name), a hosted-storefront order (code) and an Arabic one, and no other wilaya", async () => {
    const byName = await orderWithWilaya("Batna");
    const byCode = await orderWithWilaya("05");
    const byArabic = await orderWithWilaya("باتنة");
    await orderWithWilaya("Oran");
    await orderWithWilaya("15"); // Tizi Ouzou: contains the digit 5 but is not Batna
    await orderWithWilaya("50");

    const spellings = wilayaStoredSpellings(5)!;
    const rows = await db.order.findMany({ where: { wilaya: { in: spellings } }, select: { orderNumber: true } });

    expect(rows.map((r) => r.orderNumber).sort()).toEqual([byName, byCode, byArabic].sort());
  });

  it("with only the name (the old filter) the hosted-storefront order is missed", async () => {
    await orderWithWilaya("Batna");
    await orderWithWilaya("05");
    const rows = await db.order.findMany({ where: { wilaya: "Batna" } });
    expect(rows).toHaveLength(1);
  });
});
