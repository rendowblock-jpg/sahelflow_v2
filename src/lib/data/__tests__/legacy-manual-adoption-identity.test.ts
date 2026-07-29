process.env.SF_MASTER_KEY = process.env.SF_MASTER_KEY ?? "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { cleanDb, rawDb } from "@/app/api/__tests__/helpers";
import { orderService } from "@/lib/data/order-service";
import type { ServiceContext } from "@/lib/data/service-base";
import { isTrustedManualOrderAuthority } from "@/lib/orders/manual-order-authority";

const context = { prisma: rawDb as never } satisfies ServiceContext;
let sequence = 0;

beforeEach(cleanDb);
afterAll(async () => {
  await cleanDb();
  await rawDb.$disconnect();
});

async function seedVariantCatalog() {
  sequence += 1;
  const category = await rawDb.category.create({
    data: { name: `Adoption Category ${sequence}` },
  });
  const product = await rawDb.product.create({
    data: {
      name: `Adoption Product ${sequence}`,
      price: 1200,
      stock: 4,
      lowStockThreshold: 0,
      categoryId: category.id,
      isActive: true,
      productVariants: {
        create: {
          name: "Exact Variant",
          price: 1200,
          stock: 4,
          isActive: true,
        },
      },
    },
    include: { productVariants: true },
  });
  return { product, variant: product.productVariants[0]! };
}

async function seedHistoricalOrder(options: {
  productId: string;
  productVariantId: string | null;
  productVariantName: string | null;
}) {
  sequence += 1;
  const customer = await rawDb.customer.create({
    data: {
      name: `Adoption Customer ${sequence}`,
      phone: `0555${String(sequence).padStart(6, "0")}`,
      nameBlindIndex: `adoption-customer-${sequence}`,
    },
  });
  return rawDb.order.create({
    data: {
      orderNumber: `ADOPTION-${sequence}`,
      status: "pending",
      version: 1,
      customerId: customer.id,
      totalPrice: 1200,
      deliveryCost: 0,
      wilaya: "Alger",
      commune: "Alger Centre",
      address: "Historical address",
      phone: customer.phone,
      source: "manual",
      sourceMetadata: null,
      items: {
        create: {
          productId: options.productId,
          productVariantId: options.productVariantId,
          productName: "Historical mapped product",
          productVariantName: options.productVariantName,
          quantity: 1,
          unitPrice: 1200,
          total: 1200,
        },
      },
    },
  });
}

async function reservationCount(orderId: string): Promise<number> {
  const rows = await rawDb.$queryRaw<Array<{ total: number | bigint }>>`
    SELECT COUNT(*) AS "total"
    FROM "InventoryReservation"
    WHERE "orderId" = ${orderId}
  `;
  return Number(rows[0]?.total ?? 0);
}

describe("legacy manual governed adoption identity", () => {
  it("rejects a variant-bearing product when the historical item lacks the exact variant", async () => {
    const { product, variant } = await seedVariantCatalog();
    const order = await seedHistoricalOrder({
      productId: product.id,
      productVariantId: null,
      productVariantName: null,
    });

    await expect(
      orderService.updateStatus(context, order.id, "confirmed", { actor: "user" }),
    ).rejects.toThrow();

    expect(await rawDb.order.findUnique({ where: { id: order.id } })).toMatchObject({
      status: "pending",
      version: 1,
      sourceMetadata: null,
    });
    expect(await rawDb.product.findUnique({ where: { id: product.id } })).toMatchObject({
      stock: 4,
    });
    expect(await rawDb.productVariant.findUnique({ where: { id: variant.id } })).toMatchObject({
      stock: 4,
    });
    expect(await reservationCount(order.id)).toBe(0);
  });

  it("adopts and confirms a historical item with one exact active variant", async () => {
    const { product, variant } = await seedVariantCatalog();
    const order = await seedHistoricalOrder({
      productId: product.id,
      productVariantId: variant.id,
      productVariantName: variant.name,
    });

    const confirmed = await orderService.updateStatus(
      context,
      order.id,
      "confirmed",
      { actor: "user" },
    );

    expect(confirmed).toMatchObject({ status: "confirmed", version: 2 });
    expect(
      isTrustedManualOrderAuthority(confirmed.source, confirmed.sourceMetadata),
    ).toBe(true);
    expect(await rawDb.productVariant.findUnique({ where: { id: variant.id } })).toMatchObject({
      stock: 3,
    });
    expect(await rawDb.product.findUnique({ where: { id: product.id } })).toMatchObject({
      stock: 3,
    });
    expect(await reservationCount(order.id)).toBe(1);
  });
});
