process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  sourceBusinessPrincipal,
  type BusinessPrincipalContext,
} from "@/lib/business-truth/principal";
import { productService } from "@/lib/data/product-service";
import { createCanonicalSourceOrder } from "@/lib/orders/canonical-source-order";
import { executeManualOrderDecision } from "@/lib/orders/manual-confirmation";

const db = new PrismaClient();
const sourceContext = {
  prisma: db as never,
  businessPrincipal: sourceBusinessPrincipal("storefront", "catalog-guard"),
} satisfies BusinessPrincipalContext;

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

beforeEach(clean);
afterAll(async () => {
  await clean();
  await db.$disconnect();
});

describe("canonical source catalog guard", () => {
  it("blocks mutation while pending and releases the fence after rejection", async () => {
    const category = await db.category.create({
      data: { name: "Canonical source catalog guard" },
    });
    const product = await db.product.create({
      data: {
        name: "Guarded source product",
        price: 2500,
        stock: 10,
        isActive: true,
        categoryId: category.id,
      },
    });
    const created = await createCanonicalSourceOrder(sourceContext, {
      idempotencyKey: "storefront:catalog-guard-order",
      source: "storefront",
      sourceIdentity: "catalog-guard",
      sourceOrderId: "catalog-guard-order",
      newCustomer: {
        name: "Catalog guard customer",
        phone: "0555123456",
        wilaya: "Alger",
        commune: "Alger Centre",
        address: "1 Guard Street",
      },
      items: [{ productId: product.id, quantity: 1 }],
      wilaya: "Alger",
      commune: "Alger Centre",
      address: "1 Guard Street",
      phone: "0555123456",
      deliveryCost: 0,
    });

    await expect(
      productService.update(
        { prisma: db as never },
        product.id,
        { stock: 20 },
      ),
    ).rejects.toMatchObject({ code: "CANONICAL_CATALOG_MUTATION_BLOCKED" });

    await executeManualOrderDecision(
      { prisma: db as never },
      {
        orderId: created.result.order.id,
        decision: "reject",
        expectedVersion: 1,
        idempotencyKey: "source-catalog-guard-reject",
        reason: "customer-cancelled-before-confirmation",
      },
    );

    const updated = await productService.update(
      { prisma: db as never },
      product.id,
      { stock: 20 },
    );
    expect(updated.stock).toBe(20);
  });
});
