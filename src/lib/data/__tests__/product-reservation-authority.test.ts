process.env.SF_MASTER_KEY = process.env.SF_MASTER_KEY ?? "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { cleanDb, rawDb } from "@/app/api/__tests__/helpers";
import type { ServiceContext } from "@/lib/data/service-base";
import { productService } from "@/lib/data/product-service";
import { executeManualOrderDecision } from "@/lib/orders/manual-confirmation";
import { trustedManualOrderSourceMetadata } from "@/lib/orders/manual-order-authority";

const context = { prisma: rawDb as never } satisfies ServiceContext;
let sequence = 0;

beforeEach(cleanDb);
afterAll(async () => {
  await cleanDb();
  await rawDb.$disconnect();
});

async function seedProduct(stock = 5) {
  sequence += 1;
  const category = await rawDb.category.create({
    data: { name: `Reservation Category ${sequence}` },
  });
  return rawDb.product.create({
    data: {
      name: `Reservation Product ${sequence}`,
      price: 2000,
      stock,
      lowStockThreshold: 1,
      categoryId: category.id,
      isActive: true,
    },
  });
}

async function confirmTrustedOrder(productId: string) {
  sequence += 1;
  const customer = await rawDb.customer.create({
    data: {
      name: `Reservation Customer ${sequence}`,
      phone: `055500${String(sequence).padStart(4, "0")}`,
      nameBlindIndex: `reservation-customer-${sequence}`,
      wilaya: "Alger",
      commune: "Alger Centre",
      address: "Reservation address",
    },
  });
  const order = await rawDb.order.create({
    data: {
      orderNumber: `RESERVE-${sequence}`,
      status: "pending",
      version: 1,
      customerId: customer.id,
      totalPrice: 2000,
      deliveryCost: 0,
      wilaya: "Alger",
      commune: "Alger Centre",
      address: "Reservation address",
      phone: customer.phone,
      source: "manual",
      sourceMetadata: trustedManualOrderSourceMetadata(),
      items: {
        create: [{
          productId,
          productName: "Reserved product",
          quantity: 1,
          unitPrice: 2000,
          total: 2000,
        }],
      },
    },
  });
  await executeManualOrderDecision(context, {
    orderId: order.id,
    decision: "confirm",
    expectedVersion: 1,
    idempotencyKey: `reservation-confirm-${sequence}`,
  });
  return order;
}

describe("product reservation authority", () => {
  it("blocks stock, variant and delete mutations while a reservation is active", async () => {
    const product = await seedProduct(5);
    await confirmTrustedOrder(product.id);

    await expect(
      productService.update(context, product.id, { stock: 99 }),
    ).rejects.toThrow(/active canonical reservations/i);
    await expect(
      productService.update(context, product.id, {
        variants: [{ name: "Injected variant", stock: 5 }],
      }),
    ).rejects.toThrow(/active canonical reservations/i);
    await expect(
      productService.delete(context, product.id),
    ).rejects.toThrow(/active canonical reservations/i);

    expect(await rawDb.product.findUnique({ where: { id: product.id } })).toMatchObject({
      stock: 4,
      deletedAt: null,
      isActive: true,
    });
  });

  it("rejects negative parent and variant availability", async () => {
    const product = await seedProduct(5);

    await expect(
      productService.update(context, product.id, { stock: -1 }),
    ).rejects.toThrow(/cannot be negative/i);
    await expect(
      productService.update(context, product.id, {
        variants: [{ name: "Invalid", stock: -1 }],
      }),
    ).rejects.toThrow(/cannot be negative/i);

    expect(await rawDb.product.findUnique({ where: { id: product.id } })).toMatchObject({
      stock: 5,
    });
  });

  it("rejects a variant identifier owned by another product without mutating it", async () => {
    const first = await seedProduct(5);
    const second = await seedProduct(9);
    const foreignVariant = await rawDb.productVariant.create({
      data: {
        productId: second.id,
        name: "Foreign variant",
        sku: `FOREIGN-${sequence}`,
        price: 2400,
        stock: 9,
        isActive: true,
        sortOrder: 0,
      },
    });

    await expect(
      productService.update(context, first.id, {
        variants: [{
          id: foreignVariant.id,
          name: "Hijacked variant",
          sku: foreignVariant.sku,
          price: 1,
          stock: 1,
          isActive: false,
          sortOrder: 0,
        }],
      }),
    ).rejects.toThrow(/does not belong to product/i);

    expect(
      await rawDb.productVariant.findUnique({ where: { id: foreignVariant.id } }),
    ).toMatchObject({
      productId: second.id,
      name: "Foreign variant",
      price: 2400,
      stock: 9,
      isActive: true,
    });
    expect(
      await rawDb.product.findUnique({ where: { id: first.id } }),
    ).toMatchObject({ stock: 5 });
  });
});
