process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { ServiceContext } from "@/lib/data/service-base";
import { createTrustedManualOrder } from "../manual-order";

const db = new PrismaClient();
const context = { prisma: db as never } satisfies ServiceContext;
let sequence = 0;

async function clean(): Promise<void> {
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
  await db.orderChange.deleteMany();
  await db.orderItem.deleteMany();
  await db.order.deleteMany();
  await db.productVariant.deleteMany();
  await db.product.deleteMany();
  await db.category.deleteMany();
  await db.customer.deleteMany();
}

async function seedProduct(price = 2500, stock = 10) {
  sequence += 1;
  const category = await db.category.create({
    data: { name: `Manual intake category ${sequence}` },
  });
  return db.product.create({
    data: {
      name: `Manual intake product ${sequence}`,
      price,
      stock,
      isActive: true,
      categoryId: category.id,
    },
  });
}

function request(productId: string, idempotencyKey: string) {
  return {
    idempotencyKey,
    newCustomer: {
      name: "Manual customer",
      phone: "05 55 12 34 56",
      wilaya: "Alger",
      commune: "Alger Centre",
      address: "1 Test Street",
    },
    items: [{ productId, quantity: 2 }],
    wilaya: "Alger",
    commune: "Alger Centre",
    address: "1 Test Street",
    phone: "05 55 12 34 56",
    deliveryCost: 600,
    source: "manual" as const,
  };
}

beforeEach(clean);
afterAll(async () => {
  await clean();
  await db.$disconnect();
});

describe("trusted manual order intake", () => {
  it("creates customer and order atomically from server-authoritative catalog pricing", async () => {
    const product = await seedProduct(2750);

    const result = await createTrustedManualOrder(
      context,
      request(product.id, "manual-create-success"),
    );

    expect(result).toMatchObject({ replayed: false, aggregateVersion: 1 });
    expect(result.result.customerCreated).toBe(true);
    expect(result.result.order).toMatchObject({
      status: "pending",
      source: "manual",
      phone: "0555123456",
      totalPrice: 6100,
      version: 1,
    });
    expect(result.result.order.items).toEqual([
      expect.objectContaining({
        productId: product.id,
        quantity: 2,
        unitPrice: 2750,
        total: 5500,
      }),
    ]);
    expect(await db.customer.count()).toBe(1);
    expect(await db.order.count()).toBe(1);
    expect(await db.auditLog.count()).toBe(1);
  });

  it("replays the same command without duplicating customer or order", async () => {
    const product = await seedProduct();
    const input = request(product.id, "manual-create-replay");

    const first = await createTrustedManualOrder(context, input);
    const replay = await createTrustedManualOrder(context, input);

    expect(replay).toEqual({ ...first, replayed: true });
    expect(await db.customer.count()).toBe(1);
    expect(await db.order.count()).toBe(1);
  });

  it("requires one exact active variant and applies its price", async () => {
    const product = await seedProduct(2500, 3);
    const variant = await db.productVariant.create({
      data: {
        productId: product.id,
        name: "Large",
        price: 3100,
        stock: 3,
        isActive: true,
      },
    });

    await expect(
      createTrustedManualOrder(
        context,
        request(product.id, "manual-create-missing-variant"),
      ),
    ).rejects.toThrow(/requires one exact active variant/i);
    expect(await db.order.count()).toBe(0);

    const input = {
      ...request(product.id, "manual-create-exact-variant"),
      items: [{
        productId: product.id,
        productVariantId: variant.id,
        quantity: 2,
      }],
    };
    const created = await createTrustedManualOrder(context, input);
    expect(created.result.order).toMatchObject({ totalPrice: 6800 });
    expect(created.result.order.items).toEqual([
      expect.objectContaining({
        productVariantId: variant.id,
        productVariantName: "Large",
        unitPrice: 3100,
      }),
    ]);
  });

  it("reuses an existing normalized customer identity", async () => {
    const product = await seedProduct();
    const customer = await db.customer.create({
      data: {
        name: "Existing customer",
        phone: "0555123456",
        nameBlindIndex: "existing-customer",
        wilaya: "Alger",
        commune: "Alger Centre",
        address: "Existing address",
      },
    });

    const result = await createTrustedManualOrder(
      context,
      request(product.id, "manual-create-deduplicate-customer"),
    );

    expect(result.result.customerCreated).toBe(false);
    expect(result.result.order.customerId).toBe(customer.id);
    expect(await db.customer.count()).toBe(1);
  });
});
