process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  sourceBusinessPrincipal,
  type BusinessPrincipalContext,
} from "@/lib/business-truth/principal";
import { executeManualOrderDecision } from "@/lib/orders/manual-confirmation";
import { createCanonicalSourceOrder } from "@/lib/orders/canonical-source-order";
import { isCanonicalOrderAuthority } from "@/lib/orders/manual-order-authority";

const db = new PrismaClient();
const context = {
  prisma: db as never,
  businessPrincipal: sourceBusinessPrincipal("storefront", "demo-store"),
} satisfies BusinessPrincipalContext;
let sequence = 0;

async function clean(): Promise<void> {
  await db.$executeRawUnsafe('DELETE FROM "CanonicalRefundReversal"');
  await db.$executeRawUnsafe('DELETE FROM "CanonicalRefund"');
  await db.$executeRawUnsafe('DELETE FROM "CanonicalExchangeOrder"');
  await db.$executeRawUnsafe('DELETE FROM "CanonicalExchangeRequestItem"');
  await db.$executeRawUnsafe('DELETE FROM "CanonicalExchangeRequest"');
  await db.$executeRawUnsafe('DELETE FROM "CanonicalReturnInspection"');
  await db.$executeRawUnsafe('DELETE FROM "CanonicalReturnEvent"');
  await db.$executeRawUnsafe('DELETE FROM "CanonicalReturnItem"');
  await db.$executeRawUnsafe('DELETE FROM "CanonicalReturnCase"');
  await db.$executeRawUnsafe('DELETE FROM "CanonicalDeliveryEvent"');
  await db.$executeRawUnsafe('DELETE FROM "CodSettlementLineMatch"');
  await db.$executeRawUnsafe('DELETE FROM "CodSettlementCorrection"');
  await db.$executeRawUnsafe('DELETE FROM "CodSettlementLine"');
  await db.$executeRawUnsafe('DELETE FROM "CodSettlement"');
  await db.$executeRawUnsafe('DELETE FROM "CodCollectionCorrection"');
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
  await db.orderChange.deleteMany();
  await db.refund.deleteMany();
  await db.return.deleteMany();
  await db.delivery.deleteMany();
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
    data: { name: `Source intake category ${sequence}` },
  });
  return db.product.create({
    data: {
      name: `Source intake product ${sequence}`,
      price,
      stock,
      isActive: true,
      categoryId: category.id,
    },
  });
}

function request(
  productId: string,
  submissionId: string,
  idempotencyKey = `storefront:${submissionId}`,
) {
  return {
    idempotencyKey,
    source: "storefront" as const,
    sourceIdentity: "demo-store",
    sourceOrderId: submissionId,
    newCustomer: {
      name: "Storefront customer",
      phone: "05 55 12 34 56",
      wilaya: "Alger",
      commune: "Alger Centre",
      address: "1 Storefront Street",
    },
    items: [{ productId, quantity: 2 }],
    wilaya: "Alger",
    commune: "Alger Centre",
    address: "1 Storefront Street",
    phone: "05 55 12 34 56",
    deliveryCost: 0,
  };
}

beforeEach(clean);
afterAll(async () => {
  await clean();
  await db.$disconnect();
});

describe("canonical source order intake", () => {
  it("creates a server-priced canonical storefront order and customer atomically", async () => {
    const product = await seedProduct(2750);
    const result = await createCanonicalSourceOrder(
      context,
      request(product.id, "11111111-1111-4111-8111-111111111111"),
    );

    expect(result).toMatchObject({ replayed: false, aggregateVersion: 1 });
    expect(result.result.customerCreated).toBe(true);
    expect(result.result.order).toMatchObject({
      source: "storefront",
      sourceOrderId: "11111111-1111-4111-8111-111111111111",
      status: "pending",
      totalPrice: 5500,
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
    expect(
      isCanonicalOrderAuthority(
        result.result.order.source,
        result.result.order.sourceMetadata,
      ),
    ).toBe(true);
    expect(await db.customer.count()).toBe(1);
    expect(await db.order.count()).toBe(1);
    expect(await db.auditLog.count()).toBe(1);
  });

  it("replays a response-loss retry without duplicating the order", async () => {
    const product = await seedProduct();
    const input = request(
      product.id,
      "22222222-2222-4222-8222-222222222222",
    );

    const first = await createCanonicalSourceOrder(context, input);
    const replay = await createCanonicalSourceOrder(context, input);

    expect(replay).toEqual({ ...first, replayed: true });
    expect(await db.customer.count()).toBe(1);
    expect(await db.order.count()).toBe(1);
  });

  it("requires the exact active variant and applies its server price", async () => {
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
      createCanonicalSourceOrder(
        context,
        request(product.id, "33333333-3333-4333-8333-333333333333"),
      ),
    ).rejects.toThrow(/requires one exact active variant/i);
    expect(await db.order.count()).toBe(0);

    const created = await createCanonicalSourceOrder(context, {
      ...request(product.id, "44444444-4444-4444-8444-444444444444"),
      items: [
        {
          productId: product.id,
          productVariantId: variant.id,
          quantity: 2,
        },
      ],
    });
    expect(created.result.order.totalPrice).toBe(6200);
    expect(created.result.order.items).toEqual([
      expect.objectContaining({
        productVariantId: variant.id,
        productVariantName: "Large",
        unitPrice: 3100,
      }),
    ]);
  });

  it("allows an adopted storefront order to enter canonical confirmation", async () => {
    const product = await seedProduct(2500, 10);
    const created = await createCanonicalSourceOrder(
      context,
      request(product.id, "55555555-5555-4555-8555-555555555555"),
    );

    const decision = await executeManualOrderDecision(
      { prisma: db as never },
      {
        orderId: created.result.order.id,
        decision: "confirm",
        expectedVersion: 1,
        idempotencyKey: "source-confirmation-success",
      },
    );

    expect(decision.result).toMatchObject({ status: "confirmed", version: 2 });
    expect(await db.inventoryReservation.count()).toBe(1);
    expect((await db.product.findUnique({ where: { id: product.id } }))?.stock).toBe(8);
  });

  it("does not collapse two legitimate orders with different submission IDs", async () => {
    const product = await seedProduct();
    await createCanonicalSourceOrder(
      context,
      request(product.id, "66666666-6666-4666-8666-666666666666"),
    );
    await createCanonicalSourceOrder(
      context,
      request(product.id, "77777777-7777-4777-8777-777777777777"),
    );

    expect(await db.order.count()).toBe(2);
    expect(await db.customer.count()).toBe(1);
  });
});
