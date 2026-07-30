process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { ServiceContext } from "@/lib/data/service-base";
import { executeManualOrderDecision } from "@/lib/orders/manual-confirmation";
import { trustedManualOrderSourceMetadata } from "@/lib/orders/manual-order-authority";
import { executeCanonicalFulfillment } from "@/lib/orders/canonical-fulfillment";
import {
  executeCanonicalOrderRecovery,
  getCanonicalOrderRecoveryPosition,
  type CanonicalOrderRecoveryAction,
  type CanonicalReturnDisposition,
} from "@/lib/orders/canonical-order-recovery";

const db = new PrismaClient();
const context = { prisma: db as never } satisfies ServiceContext;
let sequence = 0;

async function clean(): Promise<void> {
  await db.$executeRawUnsafe('DELETE FROM "CanonicalReturnInspection"');
  await db.$executeRawUnsafe('DELETE FROM "CanonicalReturnEvent"');
  await db.$executeRawUnsafe('DELETE FROM "CanonicalReturnCase"');
  await db.$executeRawUnsafe('DELETE FROM "CanonicalDeliveryEvent"');
  await db.$executeRawUnsafe('DELETE FROM "CodSettlementMatch"');
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

interface SeedOptions {
  quantity?: number;
  stock?: number;
  cost?: number | null;
  variant?: boolean;
}

async function seedConfirmedOrder(options: SeedOptions = {}) {
  sequence += 1;
  const quantity = options.quantity ?? 2;
  const stock = options.stock ?? 10;
  const category = await db.category.create({
    data: { name: `Recovery category ${sequence}` },
  });
  const product = await db.product.create({
    data: {
      name: `Recovery product ${sequence}`,
      price: 2500,
      cost: options.cost === undefined ? 900 : options.cost,
      stock,
      categoryId: category.id,
      isActive: true,
    },
  });
  const variant = options.variant
    ? await db.productVariant.create({
        data: {
          productId: product.id,
          name: `Recovery variant ${sequence}`,
          stock,
          isActive: true,
        },
      })
    : null;
  const customer = await db.customer.create({
    data: {
      name: `Recovery customer ${sequence}`,
      phone: `recovery-phone-${sequence}`,
      nameBlindIndex: `recovery-name-${sequence}`,
      wilaya: "Alger",
      commune: "Alger Centre",
      address: "Test",
    },
  });
  const order = await db.order.create({
    data: {
      orderNumber: `ORD-RECOVERY-${sequence}`,
      status: "pending",
      version: 1,
      fulfillmentState: "unfulfilled",
      deliveryState: "not_created",
      inventoryState: "unreserved",
      codState: "not_expected",
      customerId: customer.id,
      totalPrice: 2500 * quantity,
      deliveryCost: 0,
      wilaya: "Alger",
      commune: "Alger Centre",
      address: "Test",
      phone: `order-recovery-phone-${sequence}`,
      source: "manual",
      sourceMetadata: trustedManualOrderSourceMetadata(),
      items: {
        create: [
          {
            productId: product.id,
            productVariantId: variant?.id,
            productName: product.name,
            productVariantName: variant?.name,
            quantity,
            unitPrice: 2500,
            total: 2500 * quantity,
          },
        ],
      },
    },
    include: { items: true },
  });
  await executeManualOrderDecision(context, {
    orderId: order.id,
    decision: "confirm",
    expectedVersion: 1,
    idempotencyKey: `recovery-confirm-${sequence}`,
  });
  return { order, product, variant, customer };
}

async function seedShippedOrder(options: SeedOptions = {}) {
  const seeded = await seedConfirmedOrder(options);
  await executeCanonicalFulfillment(context, {
    orderId: seeded.order.id,
    action: "pack",
    expectedVersion: 2,
    idempotencyKey: `recovery-pack-${sequence}`,
  });
  await executeCanonicalFulfillment(context, {
    orderId: seeded.order.id,
    action: "ship",
    expectedVersion: 3,
    idempotencyKey: `recovery-ship-${sequence}`,
  });
  return seeded;
}

function recover(
  orderId: string,
  action: CanonicalOrderRecoveryAction,
  expectedVersion: number,
  key: string,
  extra: {
    providerEventId?: string;
    items?: Array<{
      orderItemId: string;
      quantity: number;
      disposition: CanonicalReturnDisposition;
    }>;
  } = {},
) {
  return executeCanonicalOrderRecovery(context, {
    orderId,
    action,
    expectedVersion,
    reasonCode: `test-${action.replaceAll("_", "-")}`,
    providerEventId: extra.providerEventId,
    occurredAt: new Date(`2026-07-30T12:${String(sequence % 60).padStart(2, "0")}:00.000Z`),
    items: extra.items,
    idempotencyKey: key,
    correlationId: `${key}:correlation`,
  });
}

async function orderProjection(orderId: string) {
  const rows = await db.$queryRaw<
    Array<{
      status: string;
      version: number | bigint;
      deliveryState: string | null;
      inventoryState: string | null;
      returnState: string | null;
      refundState: string | null;
    }>
  >`
    SELECT "status", "version", "deliveryState", "inventoryState", "returnState", "refundState"
    FROM "Order"
    WHERE "id" = ${orderId}
  `;
  return rows[0];
}

beforeEach(clean);
afterAll(async () => {
  await clean();
  await db.$disconnect();
});

describe("canonical cancellation and physical return recovery", () => {
  it("releases a pre-shipment reservation and restores scalar stock exactly once", async () => {
    const { order, product } = await seedConfirmedOrder({ quantity: 2, stock: 10 });
    expect(await db.product.findUnique({ where: { id: product.id } })).toMatchObject({
      stock: 8,
    });

    const first = await recover(
      order.id,
      "cancel",
      2,
      "recovery-cancel-replay",
    );
    const replay = await recover(
      order.id,
      "cancel",
      2,
      "recovery-cancel-replay",
    );

    expect(first.result).toMatchObject({
      status: "cancelled",
      version: 3,
      inventoryState: "settled",
      returnState: "none",
    });
    expect(replay).toEqual({ ...first, replayed: true });
    expect(await db.product.findUnique({ where: { id: product.id } })).toMatchObject({
      stock: 10,
    });
    expect(
      await db.inventoryReservation.findMany({
        where: { orderId: order.id },
        select: { state: true },
      }),
    ).toEqual([{ state: "released" }]);
    expect(
      await db.inventoryMovement.count({
        where: {
          orderId: order.id,
          movementType: "reservation_released_on_cancellation",
        },
      }),
    ).toBe(1);
    expect(
      await db.compensationFact.count({
        where: { factType: "order.pre-shipment-cancellation.v1" },
      }),
    ).toBe(1);
  });

  it("restores the exact variant and recomputes active product stock on cancellation", async () => {
    const { order, product, variant } = await seedConfirmedOrder({
      quantity: 3,
      stock: 12,
      variant: true,
    });
    expect(variant).not.toBeNull();
    expect(await db.productVariant.findUnique({ where: { id: variant!.id } })).toMatchObject({
      stock: 9,
    });
    expect(await db.product.findUnique({ where: { id: product.id } })).toMatchObject({
      stock: 9,
    });

    await recover(order.id, "cancel", 2, "recovery-variant-cancel");

    expect(await db.productVariant.findUnique({ where: { id: variant!.id } })).toMatchObject({
      stock: 12,
    });
    expect(await db.product.findUnique({ where: { id: product.id } })).toMatchObject({
      stock: 12,
    });
  });

  it("allows only one concurrent cancellation to restore stock", async () => {
    const { order, product } = await seedConfirmedOrder({ quantity: 1, stock: 10 });

    const outcomes = await Promise.allSettled([
      recover(order.id, "cancel", 2, "recovery-cancel-race-a"),
      recover(order.id, "cancel", 2, "recovery-cancel-race-b"),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
    expect(await db.product.findUnique({ where: { id: product.id } })).toMatchObject({
      stock: 10,
    });
    expect(
      await db.inventoryMovement.count({
        where: {
          orderId: order.id,
          movementType: "reservation_released_on_cancellation",
        },
      }),
    ).toBe(1);
  });

  it("keeps failed delivery stock unavailable until receipt and inspection", async () => {
    const { order, product } = await seedShippedOrder({ quantity: 2, stock: 10 });
    const orderItem = order.items[0]!;

    const failed = await recover(
      order.id,
      "delivery_failed",
      4,
      "recovery-failed",
      { providerEventId: `provider-failed-${sequence}` },
    );
    expect(failed.result).toMatchObject({
      version: 5,
      deliveryState: "failed",
      inventoryState: "return_pending_receipt",
      returnState: "awaiting_return",
    });
    expect(await db.product.findUnique({ where: { id: product.id } })).toMatchObject({
      stock: 8,
    });

    await recover(
      order.id,
      "return_in_transit",
      5,
      "recovery-return-transit",
      { providerEventId: `provider-return-transit-${sequence}` },
    );
    await recover(
      order.id,
      "receive_return",
      6,
      "recovery-return-received",
      { providerEventId: `provider-return-received-${sequence}` },
    );
    expect(await db.product.findUnique({ where: { id: product.id } })).toMatchObject({
      stock: 8,
    });
    expect(await orderProjection(order.id)).toMatchObject({
      status: "returned",
      version: 7,
      deliveryState: "returned",
      inventoryState: "return_pending_inspection",
      returnState: "received",
    });

    const inspected = await recover(
      order.id,
      "inspect_return",
      7,
      "recovery-return-inspected",
      {
        items: [
          {
            orderItemId: orderItem.id,
            quantity: orderItem.quantity,
            disposition: "available",
          },
        ],
      },
    );
    expect(inspected.result).toMatchObject({
      version: 8,
      inventoryState: "settled",
      returnState: "completed",
      availableQuantity: 2,
    });
    expect(await db.product.findUnique({ where: { id: product.id } })).toMatchObject({
      stock: 10,
    });
    expect(
      await db.canonicalReturnInspection.findUnique({
        where: {
          returnId_orderItemId: {
            returnId: inspected.result.returnCaseId as string,
            orderItemId: orderItem.id,
          },
        },
      }),
    ).toMatchObject({ disposition: "available", quantity: 2 });
  });

  it("records damaged or lost goods as explicit losses without restoring available stock", async () => {
    const { order, product } = await seedShippedOrder({
      quantity: 1,
      stock: 10,
      cost: 700,
    });
    const orderItem = order.items[0]!;
    await recover(
      order.id,
      "delivery_refused",
      4,
      "recovery-refused",
      { providerEventId: `provider-refused-${sequence}` },
    );
    await recover(
      order.id,
      "receive_return",
      5,
      "recovery-refused-received",
      { providerEventId: `provider-refused-received-${sequence}` },
    );

    const inspected = await recover(
      order.id,
      "inspect_return",
      6,
      "recovery-refused-inspected",
      {
        items: [
          {
            orderItemId: orderItem.id,
            quantity: 1,
            disposition: "lost",
          },
        ],
      },
    );

    expect(inspected.result).toMatchObject({
      lostQuantity: 1,
      recordedLossAmount: 700,
      availableQuantity: 0,
    });
    expect(await db.product.findUnique({ where: { id: product.id } })).toMatchObject({
      stock: 9,
    });
    const losses = await db.financialMovement.findMany({
      where: {
        orderId: order.id,
        movementType: "returned_inventory_lost_loss",
      },
      select: { amount: true },
    });
    expect(losses).toEqual([{ amount: -700 }]);
    expect(
      await db.compensationFact.count({
        where: { factType: "return.item.disposition.v1" },
      }),
    ).toBe(1);
  });

  it("rolls back a second order when a provider event identity is reused", async () => {
    const first = await seedShippedOrder({ quantity: 1, stock: 5 });
    const second = await seedShippedOrder({ quantity: 1, stock: 5 });
    const providerEventId = `provider-event-duplicate-${sequence}`;

    await recover(
      first.order.id,
      "delivery_failed",
      4,
      "recovery-provider-event-first",
      { providerEventId },
    );
    await expect(
      recover(
        second.order.id,
        "delivery_failed",
        4,
        "recovery-provider-event-second",
        { providerEventId },
      ),
    ).rejects.toThrow();

    expect(await orderProjection(second.order.id)).toMatchObject({
      status: "shipped",
      version: 4,
      deliveryState: "in_transit",
      inventoryState: "outbound",
    });
    expect(
      await db.canonicalReturnCase.count({
        where: { orderId: second.order.id },
      }),
    ).toBe(0);
    expect(
      await db.canonicalDeliveryEvent.count({ where: { providerEventId } }),
    ).toBe(1);
  });

  it("rejects out-of-order inspection without partial facts or stock changes", async () => {
    const { order, product } = await seedShippedOrder({ quantity: 1, stock: 10 });
    const orderItem = order.items[0]!;

    await expect(
      recover(
        order.id,
        "inspect_return",
        4,
        "recovery-inspect-too-early",
        {
          items: [
            {
              orderItemId: orderItem.id,
              quantity: 1,
              disposition: "available",
            },
          ],
        },
      ),
    ).rejects.toThrow(/cannot run from/i);

    expect(await db.product.findUnique({ where: { id: product.id } })).toMatchObject({
      stock: 9,
    });
    expect(await db.canonicalReturnCase.count()).toBe(0);
    expect(await db.canonicalReturnInspection.count()).toBe(0);
    expect(await getCanonicalOrderRecoveryPosition(context, order.id)).toMatchObject({
      orderVersion: 4,
      availableActions: ["delivery_failed", "delivery_refused"],
    });
  });
});
