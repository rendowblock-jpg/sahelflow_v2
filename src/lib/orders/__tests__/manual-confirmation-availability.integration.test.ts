/**
 * DATABASE-BACKED (real SQLite, bun + prisma): this file can only run in CI.
 * It was written next to manual-confirmation.integration.test.ts and mirrors
 * its bootstrap. It could not be executed in the environment that authored it.
 *
 * Audit S03a-02 / S03c-01: confirming a manual order lowers Product.stock and
 * opens an active hold for the same units. Availability must subtract only the
 * holds that have NOT already lowered stock (storefront holds), never the
 * confirmed manual holds a second time.
 */
process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { ServiceContext } from "@/lib/data/service-base";
import { executeCanonicalFulfillment } from "../canonical-fulfillment";
import { executeCanonicalOrderRecovery } from "../canonical-order-recovery";
import { executeManualOrderDecision } from "../manual-confirmation";
import { trustedManualOrderSourceMetadata } from "../manual-order-authority";

const db = new PrismaClient();
const context = { prisma: db as never } satisfies ServiceContext;
let sequence = 0;

async function clean(): Promise<void> {
  await db.$executeRawUnsafe('DELETE FROM "CodCollection"');
  await db.$executeRawUnsafe('DELETE FROM "CompensationFact"');
  await db.$executeRawUnsafe('DELETE FROM "ProjectionInvalidation"');
  await db.$executeRawUnsafe('DELETE FROM "FinancialMovement"');
  await db.$executeRawUnsafe('DELETE FROM "InventoryMovement"');
  await db.$executeRawUnsafe('DELETE FROM "InventoryReservation"');
  await db.$executeRawUnsafe('DELETE FROM "OutboxIntent"');
  await db.$executeRawUnsafe('DELETE FROM "DomainEvent"');
  await db.$executeRawUnsafe('DELETE FROM "BusinessCommand"');
  await db.$executeRawUnsafe('DELETE FROM "BusinessAggregateVersion"');
  await db.auditLog.deleteMany();
  await db.returnNote.deleteMany();
  await db.refund.deleteMany();
  await db.return.deleteMany();
  await db.orderChange.deleteMany();
  await db.delivery.deleteMany();
  await db.orderItem.deleteMany();
  await db.order.deleteMany();
  await db.productVariant.deleteMany();
  await db.product.deleteMany();
  await db.category.deleteMany();
  await db.customer.deleteMany();
}

async function count(table: string): Promise<number> {
  const allowed = new Set([
    "BusinessCommand",
    "InventoryReservation",
    "InventoryMovement",
  ]);
  if (!allowed.has(table)) throw new Error(`unsupported table ${table}`);
  const rows = await db.$queryRawUnsafe<Array<{ total: number | bigint }>>(
    `SELECT COUNT(*) AS total FROM "${table}"`,
  );
  return Number(rows[0]?.total ?? 0);
}

async function seedProduct(stock: number) {
  sequence += 1;
  const category = await db.category.create({
    data: { name: `Availability category ${sequence}` },
  });
  return db.product.create({
    data: {
      name: `Availability product ${sequence}`,
      price: 2500,
      stock,
      lowStockThreshold: 0,
      isActive: true,
      categoryId: category.id,
    },
  });
}

async function seedOrder(options: {
  productId: string;
  quantity: number;
  productVariantId?: string | null;
}) {
  sequence += 1;
  const customer = await db.customer.create({
    data: {
      name: `Availability customer ${sequence}`,
      phone: `availability-phone-${sequence}`,
      nameBlindIndex: `availability-name-${sequence}`,
      wilaya: "Alger",
      commune: "Alger Centre",
      address: "Test",
    },
  });
  return db.order.create({
    data: {
      orderNumber: `ORD-AVAILABILITY-${sequence}`,
      status: "pending",
      version: 1,
      fulfillmentState: "unfulfilled",
      deliveryState: "not_created",
      inventoryState: "unreserved",
      codState: "not_expected",
      customerId: customer.id,
      totalPrice: 2500 * options.quantity,
      deliveryCost: 0,
      wilaya: "Alger",
      commune: "Alger Centre",
      address: "Test",
      phone: `order-phone-${sequence}`,
      source: "manual",
      sourceMetadata: trustedManualOrderSourceMetadata(),
      items: {
        create: [{
          productId: options.productId,
          productVariantId: options.productVariantId ?? null,
          productName: "Availability product",
          productVariantName: options.productVariantId ? "Availability variant" : null,
          quantity: options.quantity,
          unitPrice: 2500,
          total: 2500 * options.quantity,
        }],
      },
    },
    include: { items: true },
  });
}

function confirm(orderId: string) {
  sequence += 1;
  return executeManualOrderDecision(context, {
    orderId,
    decision: "confirm" as const,
    expectedVersion: 1,
    idempotencyKey: `availability-confirm-${sequence}`,
    correlationId: `availability-confirm-${sequence}-correlation`,
  });
}

/** Seeds, then confirms, an order of `quantity` units. */
async function confirmNew(productId: string, quantity: number, productVariantId?: string) {
  const order = await seedOrder({ productId, quantity, productVariantId });
  await confirm(order.id);
  return order;
}

async function stockOf(productId: string): Promise<number> {
  const product = await db.product.findUniqueOrThrow({ where: { id: productId } });
  return product.stock;
}

/** A storefront hold as the storefront code writes it: it never lowers stock. */
async function seedStorefrontHold(
  productId: string,
  quantity: number,
  kind: "storefront-provisional" | "storefront-delegation",
) {
  sequence += 1;
  const commandId = `availability-storefront-command-${sequence}`;
  await db.businessCommand.create({
    data: {
      id: commandId,
      idempotencyKey: `availability-storefront-hold-${sequence}`,
      commandType: "test.storefront.hold",
      aggregateType: "product",
      aggregateId: productId,
      requestHash: "e".repeat(64),
      status: "committed",
      actor: "test",
      correlationId: `availability-storefront-hold-${sequence}`,
      expectedVersion: 0,
      committedVersion: 1,
    },
  });
  await db.inventoryReservation.create({
    data: {
      id: `availability-storefront-reservation-${sequence}`,
      reservationKey: `${kind}:release_availability:item-${sequence}`,
      orderId: `${kind}:storefront-availability:release_availability`,
      productId,
      quantity,
      state: "active",
      createdByCommandId: commandId,
    },
  });
}

function fulfil(orderId: string, action: "pack" | "ship", expectedVersion: number) {
  sequence += 1;
  return executeCanonicalFulfillment(context, {
    orderId,
    action,
    expectedVersion,
    idempotencyKey: `availability-${action}-${sequence}`,
    correlationId: `availability-${action}-${sequence}:correlation`,
  });
}

function cancel(orderId: string, expectedVersion: number) {
  sequence += 1;
  return executeCanonicalOrderRecovery(context, {
    orderId,
    action: "cancel",
    expectedVersion,
    reasonCode: "test-cancel",
    occurredAt: new Date("2026-07-30T12:00:00.000Z"),
    idempotencyKey: `availability-cancel-${sequence}`,
    correlationId: `availability-cancel-${sequence}:correlation`,
  });
}

const INSUFFICIENT = /insufficient available stock/i;

beforeEach(clean);
afterAll(async () => {
  await clean();
  await db.$disconnect();
});

describe("manual confirmation availability against a real database", () => {
  it("confirms single-unit orders until stock is exhausted, then refuses the next without overselling", async () => {
    const product = await seedProduct(5);
    for (let confirmed = 1; confirmed <= 5; confirmed += 1) {
      await confirmNew(product.id, 1);
      expect(await stockOf(product.id)).toBe(5 - confirmed);
    }
    expect(await db.inventoryReservation.count({ where: { state: "active" } })).toBe(5);

    const refused = await seedOrder({ productId: product.id, quantity: 1 });
    await expect(confirm(refused.id)).rejects.toThrow(INSUFFICIENT);

    expect(await stockOf(product.id)).toBe(0);
    expect(await db.order.findUnique({ where: { id: refused.id } })).toMatchObject({
      status: "pending",
      version: 1,
    });
    expect(await count("BusinessCommand")).toBe(5);
    expect(await count("InventoryReservation")).toBe(5);
    expect(await count("InventoryMovement")).toBe(5);
  });

  it("lets two orders of 5 take all 10 units on the shelf, then refuses one more", async () => {
    const product = await seedProduct(10);
    await confirmNew(product.id, 5);
    expect(await stockOf(product.id)).toBe(5);
    // Old behaviour: stock 5 - held 5 = 0, so this was refused with 5 units free.
    await confirmNew(product.id, 5);
    expect(await stockOf(product.id)).toBe(0);

    const refused = await seedOrder({ productId: product.id, quantity: 1 });
    await expect(confirm(refused.id)).rejects.toThrow(INSUFFICIENT);
    expect(await stockOf(product.id)).toBe(0);
  });

  it("refuses an oversell attempt, accepts the exact boundary, and never lets stock go negative", async () => {
    const product = await seedProduct(10);
    await confirmNew(product.id, 4);

    const tooMany = await seedOrder({ productId: product.id, quantity: 7 });
    await expect(confirm(tooMany.id)).rejects.toThrow(INSUFFICIENT);
    expect(await stockOf(product.id)).toBe(6);

    await confirmNew(product.id, 6);
    expect(await stockOf(product.id)).toBe(0);
  });

  it("applies the same rule to an exact variant and decrements the parent product once per unit", async () => {
    const product = await seedProduct(3);
    const variant = await db.productVariant.create({
      data: { productId: product.id, name: "Availability variant", stock: 3, isActive: true },
    });
    for (let confirmed = 1; confirmed <= 3; confirmed += 1) {
      await confirmNew(product.id, 1, variant.id);
    }
    expect(await db.productVariant.findUnique({ where: { id: variant.id } })).toMatchObject({ stock: 0 });
    expect(await stockOf(product.id)).toBe(0);

    const refused = await seedOrder({
      productId: product.id,
      quantity: 1,
      productVariantId: variant.id,
    });
    await expect(confirm(refused.id)).rejects.toThrow(INSUFFICIENT);
    expect(await db.productVariant.findUnique({ where: { id: variant.id } })).toMatchObject({ stock: 0 });
  });

  it("ship consumes the hold and leaves stock unchanged, and what can be confirmed afterwards is unchanged", async () => {
    const product = await seedProduct(10);
    const order = await confirmNew(product.id, 4);
    expect(await stockOf(product.id)).toBe(6);

    await fulfil(order.id, "pack", 2);
    await fulfil(order.id, "ship", 3);

    expect(await stockOf(product.id)).toBe(6);
    expect(
      await db.inventoryReservation.findMany({
        where: { orderId: order.id },
        select: { state: true },
      }),
    ).toEqual([{ state: "consumed" }]);

    await confirmNew(product.id, 6);
    expect(await stockOf(product.id)).toBe(0);
    const refused = await seedOrder({ productId: product.id, quantity: 1 });
    await expect(confirm(refused.id)).rejects.toThrow(INSUFFICIENT);
  });

  it("cancel restores the stock exactly once and frees exactly the cancelled units", async () => {
    const product = await seedProduct(10);
    const first = await confirmNew(product.id, 4);
    await confirmNew(product.id, 4);
    expect(await stockOf(product.id)).toBe(2);
    const blocked = await seedOrder({ productId: product.id, quantity: 3 });
    await expect(confirm(blocked.id)).rejects.toThrow(INSUFFICIENT);

    await cancel(first.id, 2);
    expect(await stockOf(product.id)).toBe(6);
    expect(
      await db.inventoryReservation.findMany({
        where: { orderId: first.id },
        select: { state: true },
      }),
    ).toEqual([{ state: "released" }]);

    await confirm(blocked.id); // 3 of the 6 freed units
    expect(await stockOf(product.id)).toBe(3);
    const tooMany = await seedOrder({ productId: product.id, quantity: 4 });
    await expect(confirm(tooMany.id)).rejects.toThrow(INSUFFICIENT);
    expect(await stockOf(product.id)).toBe(3);
  });

  it.each(["storefront-provisional", "storefront-delegation"] as const)(
    "a %s hold still blocks: 7 of 10 held leaves room for 3 and no more",
    async (kind) => {
      const product = await seedProduct(10);
      await seedStorefrontHold(product.id, 7, kind);

      const tooMany = await seedOrder({ productId: product.id, quantity: 4 });
      await expect(confirm(tooMany.id)).rejects.toThrow(INSUFFICIENT);
      expect(await stockOf(product.id)).toBe(10);

      await confirmNew(product.id, 3);
      expect(await stockOf(product.id)).toBe(7);
      const refused = await seedOrder({ productId: product.id, quantity: 1 });
      await expect(confirm(refused.id)).rejects.toThrow(INSUFFICIENT);
      expect(await stockOf(product.id)).toBe(7);
    },
  );

  it("subtracts a storefront hold but not the confirmed manual holds beside it", async () => {
    const product = await seedProduct(10);
    await seedStorefrontHold(product.id, 3, "storefront-provisional");
    await confirmNew(product.id, 4);
    expect(await stockOf(product.id)).toBe(6);

    // Free = stock 6 - storefront 3 = 3. The old rule subtracted 3 + 4.
    await confirmNew(product.id, 3);
    expect(await stockOf(product.id)).toBe(3);
    const refused = await seedOrder({ productId: product.id, quantity: 1 });
    await expect(confirm(refused.id)).rejects.toThrow(INSUFFICIENT);
    expect(await stockOf(product.id)).toBe(3);
  });

  it("fails closed on an active hold with an unknown key and no reserve movement", async () => {
    const product = await seedProduct(10);
    sequence += 1;
    const commandId = `availability-legacy-command-${sequence}`;
    await db.businessCommand.create({
      data: {
        id: commandId,
        idempotencyKey: `availability-legacy-hold-${sequence}`,
        commandType: "test.legacy.hold",
        aggregateType: "product",
        aggregateId: product.id,
        requestHash: "f".repeat(64),
        status: "committed",
        actor: "test",
        correlationId: `availability-legacy-hold-${sequence}`,
        expectedVersion: 0,
        committedVersion: 1,
      },
    });
    await db.inventoryReservation.create({
      data: {
        id: `availability-legacy-reservation-${sequence}`,
        reservationKey: `legacy-hold-${sequence}`,
        orderId: "legacy-order",
        productId: product.id,
        quantity: 4,
        state: "active",
        createdByCommandId: commandId,
      },
    });

    const tooMany = await seedOrder({ productId: product.id, quantity: 7 });
    await expect(confirm(tooMany.id)).rejects.toThrow(INSUFFICIENT);
    await confirmNew(product.id, 6);
    expect(await stockOf(product.id)).toBe(4);
  });
});
