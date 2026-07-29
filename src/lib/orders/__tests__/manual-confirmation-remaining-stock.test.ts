process.env.SF_MASTER_KEY = process.env.SF_MASTER_KEY ?? "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { cleanDb, rawDb } from "@/app/api/__tests__/helpers";
import type { ServiceContext } from "@/lib/data/service-base";
import { executeManualOrderDecision } from "../manual-confirmation";
import { trustedManualOrderSourceMetadata } from "../manual-order-authority";

const context = { prisma: rawDb as never } satisfies ServiceContext;
let sequence = 0;

beforeEach(cleanDb);
afterAll(async () => {
  await cleanDb();
  await rawDb.$disconnect();
});

async function seedOrder(productId: string, customerId: string) {
  sequence += 1;
  return rawDb.order.create({
    data: {
      orderNumber: `REMAINING-STOCK-${sequence}`,
      status: "pending",
      version: 1,
      customerId,
      totalPrice: 1000,
      deliveryCost: 0,
      wilaya: "Alger",
      commune: "Alger Centre",
      address: "Test",
      phone: `0555000${String(sequence).padStart(3, "0")}`,
      source: "manual",
      sourceMetadata: trustedManualOrderSourceMetadata(),
      items: {
        create: [{
          productId,
          productName: "Remaining Stock Product",
          quantity: 1,
          unitPrice: 1000,
          total: 1000,
        }],
      },
    },
  });
}

describe("canonical reservations against remaining stock", () => {
  it("allows a second order to reserve another available unit while the first reservation remains active", async () => {
    const category = await rawDb.category.create({
      data: { name: "Remaining Stock" },
    });
    const product = await rawDb.product.create({
      data: {
        name: "Remaining Stock Product",
        price: 1000,
        stock: 3,
        lowStockThreshold: 0,
        categoryId: category.id,
        isActive: true,
      },
    });
    const customer = await rawDb.customer.create({
      data: {
        name: "Remaining Stock Customer",
        phone: "0555000998",
        nameBlindIndex: "remaining-stock-customer",
      },
    });
    const first = await seedOrder(product.id, customer.id);
    const second = await seedOrder(product.id, customer.id);

    await executeManualOrderDecision(context, {
      orderId: first.id,
      decision: "confirm",
      expectedVersion: 1,
      idempotencyKey: "remaining-stock-first",
    });
    await executeManualOrderDecision(context, {
      orderId: second.id,
      decision: "confirm",
      expectedVersion: 1,
      idempotencyKey: "remaining-stock-second",
    });

    expect(await rawDb.product.findUnique({ where: { id: product.id } })).toMatchObject({
      stock: 1,
    });
    const reservations = await rawDb.$queryRaw<
      Array<{ orderId: string; quantity: number | bigint; state: string }>
    >`
      SELECT "orderId", "quantity", "state"
      FROM "InventoryReservation"
      WHERE "productId" = ${product.id}
      ORDER BY "orderId" ASC
    `;
    expect(reservations).toHaveLength(2);
    expect(reservations.map((row) => row.state)).toEqual(["active", "active"]);
    expect(reservations.map((row) => Number(row.quantity))).toEqual([1, 1]);
    expect(new Set(reservations.map((row) => row.orderId))).toEqual(
      new Set([first.id, second.id]),
    );
  });
});
