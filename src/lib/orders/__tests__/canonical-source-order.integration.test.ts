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
import {
  canonicalSourceOrderSchema,
  createCanonicalSourceOrder,
  sourceOrderCommandPayload,
} from "@/lib/orders/canonical-source-order";
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

  it("keeps the commerce provider unit price instead of the catalog price", async () => {
    const product = await seedProduct(1500);
    for (const source of ["shopify", "woocommerce", "youcan"] as const) {
      const created = await createCanonicalSourceOrder(
        {
          ...context,
          businessPrincipal: sourceBusinessPrincipal(source, "commerce-shop"),
        },
        {
          idempotencyKey: `${source}:price-1000`,
          source,
          sourceIdentity: "commerce-shop",
          sourceOrderId: `${source}-order-1000`,
          newCustomer: {
            name: `${source} buyer`,
            phone: source === "shopify" ? "0555001001" : source === "woocommerce" ? "0555001002" : "0555001003",
            wilaya: "Alger",
            commune: "Alger Centre",
            address: "1 Commerce Street",
          },
          items: [{ productId: product.id, quantity: 1, unitPrice: 1000 }],
          wilaya: "Alger",
          commune: "Alger Centre",
          address: "1 Commerce Street",
          phone: source === "shopify" ? "0555001001" : source === "woocommerce" ? "0555001002" : "0555001003",
          deliveryCost: 0,
        },
      );
      expect(created.result.order.totalPrice).toBe(1000);
      expect(created.result.order.items).toEqual([
        expect.objectContaining({ unitPrice: 1000, total: 1000 }),
      ]);
    }
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

/**
 * Item 2 money (M2a, task 3): a hosted bundle receipt carries one order-level discount. The kernel stores it in Order.discountDzd,
 * keeps totalPrice = items - discount + delivery, and leaves the hashed command payload byte-identical when there is no discount.
 */
describe("sourceOrderCommandPayload (item 2 money)", () => {
  const TODAYS_KEYS = [
    "source",
    "sourceIdentity",
    "sourceOrderId",
    "sourceRevision",
    "sourceDetails",
    "initialStatus",
    "customerId",
    "newCustomer",
    "items",
    "wilaya",
    "commune",
    "address",
    "phone",
    "deliveryCost",
    "notes",
  ];
  const parsed = (extra: Record<string, unknown> = {}) =>
    canonicalSourceOrderSchema.parse({ ...request("product-1", "33333333-3333-4333-8333-333333333333"), ...extra });

  it("has exactly today's 15 keys in today's order when there is no discount, so existing command digests do not change", () => {
    expect(Object.keys(sourceOrderCommandPayload(parsed(), "0551234567", undefined))).toEqual(TODAYS_KEYS);
  });

  it("is the same for no discount and for an explicit discount of 0", () => {
    expect(JSON.stringify(sourceOrderCommandPayload(parsed({ discount: 0 }), "0551234567", undefined))).toBe(
      JSON.stringify(sourceOrderCommandPayload(parsed(), "0551234567", undefined)),
    );
  });

  it("adds a sixteenth key, discount, only when the discount is above 0", () => {
    const payload = sourceOrderCommandPayload(parsed({ discount: 1500 }), "0551234567", undefined);
    expect(Object.keys(payload)).toEqual([...TODAYS_KEYS, "discount"]);
    expect(payload.discount).toBe(1500);
  });
});

describe("canonical source order with an order-level discount (item 2 money)", () => {
  const discounted = (productId: string, submissionId: string, overrides: Record<string, unknown> = {}) => ({
    ...request(productId, submissionId),
    items: [{ productId, quantity: 3 }],
    deliveryCost: 500,
    discount: 1500,
    ...overrides,
  });

  it("stores the discount, keeps the lines at the plain price and takes the discount off the items only", async () => {
    const product = await seedProduct(3000);
    const result = await createCanonicalSourceOrder(
      context,
      discounted(product.id, "44444444-4444-4444-8444-444444444444"),
    );

    expect(result.result.order).toMatchObject({ totalPrice: 8000, deliveryCost: 500, discountDzd: 1500 });
    expect(result.result.order.items).toEqual([
      expect.objectContaining({ quantity: 3, unitPrice: 3000, total: 9000 }),
    ]);
    const stored = await db.order.findUniqueOrThrow({ where: { id: result.result.order.id } });
    expect(stored).toMatchObject({ totalPrice: 8000, discountDzd: 1500 });
  });

  it("writes the discount into the creation record only when there is one", async () => {
    const product = await seedProduct(3000);
    const withDiscount = await createCanonicalSourceOrder(
      context,
      discounted(product.id, "55555555-5555-4555-8555-555555555555"),
    );
    const without = await createCanonicalSourceOrder(
      context,
      discounted(product.id, "66666666-6666-4666-8666-666666666666", { discount: undefined }),
    );
    const payloadOf = async (orderId: string) => {
      const change = await db.orderChange.findFirstOrThrow({ where: { orderId, actionType: "created" } });
      return JSON.parse(change.payload ?? "{}") as Record<string, unknown>;
    };

    expect(await payloadOf(withDiscount.result.order.id)).toMatchObject({ totalPrice: 8000, discountDzd: 1500 });
    expect(await payloadOf(without.result.order.id)).not.toHaveProperty("discountDzd");
    expect(await db.order.findUniqueOrThrow({ where: { id: without.result.order.id } })).toMatchObject({
      totalPrice: 9500,
      discountDzd: 0,
    });
  });

  it("accepts a discount equal to the items and refuses one dinar more, naming the field and writing nothing", async () => {
    const product = await seedProduct(3000);
    const whole = await createCanonicalSourceOrder(
      context,
      discounted(product.id, "77777777-7777-4777-8777-777777777777", { discount: 9000 }),
    );
    expect(whole.result.order).toMatchObject({ totalPrice: 500, discountDzd: 9000 });

    await expect(
      createCanonicalSourceOrder(
        context,
        discounted(product.id, "88888888-8888-4888-8888-888888888888", { discount: 9001 }),
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", field: "discount" });
    expect(await db.order.count()).toBe(1);
  });

  it("refuses a discounted order that would be free: the kernel keeps its own rule, not only the receipt (D3)", async () => {
    const product = await seedProduct(3000);

    await expect(
      createCanonicalSourceOrder(
        context,
        discounted(product.id, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", { discount: 9000, deliveryCost: 0 }),
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", field: "discount" });
    expect(await db.order.count()).toBe(0);
    expect(await db.businessCommand.count()).toBe(0);

    // One dinar short of the whole items, or any delivery cost, leaves something to collect.
    const almost = await createCanonicalSourceOrder(
      context,
      discounted(product.id, "cccccccc-cccc-4ccc-8ccc-cccccccccccc", { discount: 8999, deliveryCost: 0 }),
    );
    expect(almost.result.order).toMatchObject({ totalPrice: 1, discountDzd: 8999 });
  });

  it("writes the discount into the audit row of the created order only when there is one", async () => {
    const product = await seedProduct(3000);
    const withDiscount = await createCanonicalSourceOrder(
      context,
      discounted(product.id, "dddddddd-dddd-4ddd-8ddd-dddddddddddd"),
    );
    const without = await createCanonicalSourceOrder(
      context,
      discounted(product.id, "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", { discount: undefined }),
    );
    const afterOf = async (orderId: string) => {
      const row = await db.auditLog.findFirstOrThrow({ where: { entityId: orderId, action: "order.source.created.v1" } });
      return JSON.parse(row.after ?? "{}") as Record<string, unknown>;
    };

    expect(await afterOf(withDiscount.result.order.id)).toMatchObject({ totalPrice: 8000, discountDzd: 1500 });
    expect(await afterOf(without.result.order.id)).not.toHaveProperty("discountDzd");
  });

  it("refuses a discount from any source but a hosted storefront receipt, and still takes the same order without one", async () => {
    const product = await seedProduct(3000);
    const fromWhatsapp = {
      ...request(product.id, "99999999-9999-4999-8999-999999999999"),
      source: "whatsapp" as const,
      sourceIdentity: "213555123456@s.whatsapp.net",
    };

    await expect(createCanonicalSourceOrder(context, { ...fromWhatsapp, discount: 1 })).rejects.toThrow(
      /Only an authoritative storefront receipt may carry an order discount/,
    );
    expect(await db.order.count()).toBe(0);

    const plain = await createCanonicalSourceOrder(context, fromWhatsapp);
    expect(plain.result.order).toMatchObject({ totalPrice: 6000, discountDzd: 0 });
  });

  it("replays a retry of the same discounted order without a second row, and refuses the same key with another discount", async () => {
    const product = await seedProduct(3000);
    const input = discounted(product.id, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");

    const first = await createCanonicalSourceOrder(context, input);
    const replay = await createCanonicalSourceOrder(context, input);
    expect(replay).toEqual({ ...first, replayed: true });
    expect(await db.order.count()).toBe(1);

    await expect(createCanonicalSourceOrder(context, { ...input, discount: 1000 })).rejects.toThrow(
      /already bound to different command content/i,
    );
    expect(await db.order.count()).toBe(1);
  });
});
