process.env.SF_MASTER_KEY = process.env.SF_MASTER_KEY ?? "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { cleanDb, rawDb } from "@/app/api/__tests__/helpers";
import type { ServiceContext } from "@/lib/data/service-base";
import { createTrustedManualOrder } from "../manual-order";

const context = { prisma: rawDb as never } satisfies ServiceContext;
let sequence = 0;

async function seedProduct() {
  sequence += 1;
  const category = await rawDb.category.create({
    data: { name: `Manual Authority ${sequence}` },
  });
  return rawDb.product.create({
    data: {
      name: `Manual Authority Product ${sequence}`,
      price: 2500,
      stock: 20,
      categoryId: category.id,
      isActive: true,
    },
  });
}

async function seedCustomer(phone = "0555123456") {
  sequence += 1;
  return rawDb.customer.create({
    data: {
      name: `Manual Authority Customer ${sequence}`,
      phone,
      nameBlindIndex: `manual-authority-${sequence}`,
      wilaya: "Alger",
      commune: "Alger Centre",
      address: "1 Authority Street",
    },
  });
}

function request(
  productId: string,
  overrides: Record<string, unknown> = {},
) {
  sequence += 1;
  return {
    idempotencyKey: `manual-authority-key-${sequence}`,
    items: [{ productId, quantity: 1 }],
    wilaya: "Alger",
    commune: "Alger Centre",
    address: "1 Authority Street",
    phone: "05 55 12 34 56",
    deliveryCost: 600,
    source: "manual",
    ...overrides,
  };
}

beforeEach(cleanDb);
afterAll(async () => {
  await cleanDb();
  await rawDb.$disconnect();
});

describe("trusted manual intake authority", () => {
  it("normalizes phone before deduplication and persistence", async () => {
    const product = await seedProduct();
    const existing = await seedCustomer("0555123456");

    const result = await createTrustedManualOrder(
      context,
      request(product.id, {
        newCustomer: {
          name: "Formatted Duplicate",
          phone: "05 55 12 34 56",
          wilaya: "Alger",
          commune: "Alger Centre",
          address: "1 Authority Street",
        },
      }),
    );

    expect(result.result.customerCreated).toBe(false);
    expect(result.result.order.customerId).toBe(existing.id);
    expect(result.result.order.phone).toBe("0555123456");
    expect(await rawDb.customer.count()).toBe(1);
  });

  it("rejects an active product whose variant rows are all inactive", async () => {
    const product = await seedProduct();
    const customer = await seedCustomer("0555000111");
    await rawDb.productVariant.create({
      data: {
        productId: product.id,
        name: "Retired size",
        stock: 10,
        isActive: false,
      },
    });

    await expect(
      createTrustedManualOrder(
        context,
        request(product.id, {
          customerId: customer.id,
          phone: "0555000111",
        }),
      ),
    ).rejects.toThrow(/variants but none are active/i);

    expect(await rawDb.order.count()).toBe(0);
    expect(await rawDb.product.findUnique({ where: { id: product.id } })).toMatchObject({
      stock: 20,
    });
  });

  it("prevents deleting a variant referenced by a pending order", async () => {
    const product = await seedProduct();
    const variant = await rawDb.productVariant.create({
      data: {
        productId: product.id,
        name: "Exact pending size",
        stock: 10,
        isActive: true,
      },
    });
    const customer = await seedCustomer("0555000222");

    const created = await createTrustedManualOrder(
      context,
      request(product.id, {
        customerId: customer.id,
        phone: "0555000222",
        items: [{
          productId: product.id,
          productVariantId: variant.id,
          quantity: 1,
        }],
      }),
    );

    // Prisma wraps the underlying SQLite trigger message, so the durable
    // contract is rejection plus unchanged variant/order identity—not adapter
    // wording.
    await expect(
      rawDb.productVariant.delete({ where: { id: variant.id } }),
    ).rejects.toBeDefined();

    expect(await rawDb.productVariant.findUnique({ where: { id: variant.id } })).not.toBeNull();
    expect(await rawDb.orderItem.findFirst({
      where: { orderId: created.result.order.id },
    })).toMatchObject({ productVariantId: variant.id });
  });
});
