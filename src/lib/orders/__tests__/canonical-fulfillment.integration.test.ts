process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { ServiceContext } from "@/lib/data/service-base";
import { orderService } from "@/lib/data/order-service";
import { executeManualOrderDecision } from "../manual-confirmation";
import { trustedManualOrderSourceMetadata } from "../manual-order-authority";
import { executeCanonicalFulfillment } from "../canonical-fulfillment";

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
    "AuditLog",
    "BusinessCommand",
    "DomainEvent",
    "OutboxIntent",
    "InventoryReservation",
    "InventoryMovement",
    "FinancialMovement",
    "ProjectionInvalidation",
  ]);
  if (!allowed.has(table)) throw new Error(`unsupported table ${table}`);
  const rows = await db.$queryRawUnsafe<Array<{ total: number | bigint }>>(
    `SELECT COUNT(*) AS total FROM "${table}"`,
  );
  return Number(rows[0]?.total ?? 0);
}

async function seedConfirmedOrder(quantity = 2) {
  sequence += 1;
  const category = await db.category.create({
    data: { name: `Fulfillment category ${sequence}` },
  });
  const product = await db.product.create({
    data: {
      name: `Fulfillment product ${sequence}`,
      price: 2500,
      stock: 10,
      categoryId: category.id,
      isActive: true,
    },
  });
  const customer = await db.customer.create({
    data: {
      name: `Fulfillment customer ${sequence}`,
      phone: `fulfillment-phone-${sequence}`,
      nameBlindIndex: `fulfillment-name-${sequence}`,
      wilaya: "Alger",
      commune: "Alger Centre",
      address: "Test",
    },
  });
  const order = await db.order.create({
    data: {
      orderNumber: `ORD-FULFILLMENT-${sequence}`,
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
      phone: `order-phone-${sequence}`,
      source: "manual",
      sourceMetadata: trustedManualOrderSourceMetadata(),
      items: {
        create: [{
          productId: product.id,
          productName: product.name,
          quantity,
          unitPrice: 2500,
          total: 2500 * quantity,
        }],
      },
    },
  });
  await executeManualOrderDecision(context, {
    orderId: order.id,
    decision: "confirm",
    expectedVersion: 1,
    idempotencyKey: `fulfillment-confirm-${sequence}`,
  });
  return { order, product, customer };
}

function transition(
  orderId: string,
  action: "pack" | "ship" | "deliver",
  expectedVersion: number,
  idempotencyKey: string,
) {
  return executeCanonicalFulfillment(context, {
    orderId,
    action,
    expectedVersion,
    idempotencyKey,
    correlationId: `${idempotencyKey}:correlation`,
  });
}

beforeEach(clean);
afterAll(async () => {
  await clean();
  await db.$disconnect();
});

describe("canonical manual fulfillment and delivery", () => {
  it("packs, ships and delivers with independent state, inventory and COD facts", async () => {
    const { order, customer } = await seedConfirmedOrder(2);

    const packed = await transition(order.id, "pack", 2, "fulfillment-pack-happy");
    const shipped = await transition(order.id, "ship", 3, "fulfillment-ship-happy");
    const delivered = await transition(order.id, "deliver", 4, "fulfillment-deliver-happy");

    expect(packed.result).toMatchObject({
      status: "confirmed",
      version: 3,
      fulfillmentState: "ready",
      inventoryState: "reserved",
    });
    expect(shipped.result).toMatchObject({
      status: "shipped",
      version: 4,
      fulfillmentState: "shipped",
      deliveryState: "in_transit",
      inventoryState: "outbound",
    });
    expect(delivered.result).toMatchObject({
      status: "delivered",
      version: 5,
      fulfillmentState: "closed",
      deliveryState: "delivered",
      inventoryState: "settled",
      codState: "receivable",
      codReceivableAmount: 5000,
    });
    expect(await db.order.findUnique({ where: { id: order.id } })).toMatchObject({
      status: "delivered",
      version: 5,
      fulfillmentState: "closed",
      deliveryState: "delivered",
      inventoryState: "settled",
      codState: "receivable",
      codCollected: false,
      codRemitted: false,
    });
    expect(await db.delivery.findUnique({ where: { orderId: order.id } })).toMatchObject({
      provider: "manual",
      status: "delivered",
      trackingNumber: null,
    });
    expect(await db.customer.findUnique({ where: { id: customer.id } })).toMatchObject({
      orderCount: 1,
      totalSpent: 5000,
    });
    const reservations = await db.$queryRaw<Array<{ state: string }>>`
      SELECT "state" FROM "InventoryReservation" WHERE "orderId" = ${order.id}
    `;
    expect(reservations).toEqual([{ state: "consumed" }]);
    expect(await count("InventoryMovement")).toBe(2);
    expect(await count("FinancialMovement")).toBe(1);
    expect(await count("BusinessCommand")).toBe(4);
    expect(await count("DomainEvent")).toBe(4);
    expect(await count("OutboxIntent")).toBe(4);
    expect(await count("AuditLog")).toBe(4);
    const deliveredOutbox = await db.$queryRaw<Array<{ payloadJson: string }>>`
      SELECT "payloadJson"
      FROM "OutboxIntent"
      WHERE "effectType" = 'order.delivery.delivered.v1'
    `;
    expect(deliveredOutbox).toHaveLength(1);
    expect(deliveredOutbox[0]?.payloadJson).not.toContain(order.id);
    expect(deliveredOutbox[0]?.payloadJson).not.toContain(order.orderNumber);

    const financial = await db.$queryRaw<Array<{
      movementType: string;
      amount: number | bigint;
      currency: string;
      counterparty: string | null;
      reason: string;
    }>>`
      SELECT "movementType", "amount", "currency", "counterparty", "reason"
      FROM "FinancialMovement"
      WHERE "orderId" = ${order.id}
    `;
    expect(financial[0]).toMatchObject({
      movementType: "cod_receivable_created",
      currency: "DZD",
    });
    expect(Number(financial[0]?.amount)).toBe(5000);
    expect(financial[0]?.counterparty).not.toContain("manual-courier");
    expect(financial[0]?.reason).not.toContain(order.id);
  });

  it("replays delivery without duplicating money or customer totals", async () => {
    const { order, customer } = await seedConfirmedOrder(1);
    await transition(order.id, "pack", 2, "fulfillment-pack-replay");
    await transition(order.id, "ship", 3, "fulfillment-ship-replay");
    const inputKey = "fulfillment-deliver-replay";

    const first = await transition(order.id, "deliver", 4, inputKey);
    const replay = await transition(order.id, "deliver", 4, inputKey);

    expect(replay).toEqual({ ...first, replayed: true });
    expect(await count("FinancialMovement")).toBe(1);
    expect(await db.customer.findUnique({ where: { id: customer.id } })).toMatchObject({
      orderCount: 1,
      totalSpent: 2500,
    });
  });

  it("forward-repairs a pre-projection confirmed order only after reservation validation", async () => {
    const { order } = await seedConfirmedOrder(1);
    await db.order.update({
      where: { id: order.id },
      data: {
        fulfillmentState: null,
        deliveryState: null,
        inventoryState: null,
        codState: null,
      },
    });

    const packed = await transition(
      order.id,
      "pack",
      2,
      "fulfillment-pack-forward-repair",
    );

    expect(packed.result).toMatchObject({
      version: 3,
      fulfillmentState: "ready",
      deliveryState: "not_created",
      inventoryState: "reserved",
      codState: "not_expected",
    });
  });

  it("allows only one concurrent shipment command to consume reservations", async () => {
    const { order } = await seedConfirmedOrder(1);
    await transition(order.id, "pack", 2, "fulfillment-pack-race");

    const outcomes = await Promise.allSettled([
      transition(order.id, "ship", 3, "fulfillment-ship-race-a"),
      transition(order.id, "ship", 3, "fulfillment-ship-race-b"),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
    expect(await count("InventoryMovement")).toBe(2);
    const reservations = await db.$queryRaw<Array<{ state: string }>>`
      SELECT "state" FROM "InventoryReservation" WHERE "orderId" = ${order.id}
    `;
    expect(reservations).toEqual([{ state: "consumed" }]);
    expect(await db.delivery.count({ where: { orderId: order.id } })).toBe(1);
  });

  it("rejects out-of-order delivery without writing partial facts", async () => {
    const { order, customer } = await seedConfirmedOrder(1);
    const beforeCommands = await count("BusinessCommand");
    const beforeEvents = await count("DomainEvent");

    await expect(
      transition(order.id, "deliver", 2, "fulfillment-deliver-too-early"),
    ).rejects.toThrow(/cannot run from the current state/i);

    expect(await db.order.findUnique({ where: { id: order.id } })).toMatchObject({
      status: "confirmed",
      version: 2,
      codState: "not_expected",
    });
    expect(await count("BusinessCommand")).toBe(beforeCommands);
    expect(await count("DomainEvent")).toBe(beforeEvents);
    expect(await count("FinancialMovement")).toBe(0);
    expect(await db.customer.findUnique({ where: { id: customer.id } })).toMatchObject({
      orderCount: 0,
      totalSpent: 0,
    });
  });

  it("fails closed when reservation authority is incomplete", async () => {
    const { order } = await seedConfirmedOrder(1);
    await transition(order.id, "pack", 2, "fulfillment-pack-missing-reservation");
    await db.$executeRaw`
      UPDATE "InventoryReservation"
      SET "quantity" = "quantity" + 1
      WHERE "orderId" = ${order.id}
    `;

    await expect(
      transition(order.id, "ship", 3, "fulfillment-ship-missing-reservation"),
    ).rejects.toThrow(/does not exactly match order item/i);

    expect(await db.order.findUnique({ where: { id: order.id } })).toMatchObject({
      status: "confirmed",
      version: 3,
      fulfillmentState: "ready",
      inventoryState: "reserved",
    });
    expect(await db.delivery.count({ where: { orderId: order.id } })).toBe(0);
  });

  it("rejects reuse of an idempotency key with a different transition request", async () => {
    const { order } = await seedConfirmedOrder(1);
    const key = "fulfillment-request-binding";
    await transition(order.id, "pack", 2, key);

    await expect(transition(order.id, "ship", 3, key)).rejects.toThrow(
      /different command content/i,
    );
    expect(await db.order.findUnique({ where: { id: order.id } })).toMatchObject({
      status: "confirmed",
      version: 3,
      fulfillmentState: "ready",
    });
  });

  it("keeps AI, automation and legacy status callers outside canonical fulfillment", async () => {
    const { order } = await seedConfirmedOrder(1);

    await expect(
      orderService.updateStatus(context, order.id, "shipped", { actor: "ai" }),
    ).rejects.toThrow(/governed fulfillment command/i);
    await expect(
      orderService.updateStatus(context, order.id, "shipped", { actor: "system" }),
    ).rejects.toThrow(/governed fulfillment command/i);

    expect(await db.order.findUnique({ where: { id: order.id } })).toMatchObject({
      status: "confirmed",
      version: 2,
      fulfillmentState: "unfulfilled",
      inventoryState: "reserved",
    });
    expect(await db.delivery.count({ where: { orderId: order.id } })).toBe(0);
    expect(await count("InventoryMovement")).toBe(1);
    expect(await count("FinancialMovement")).toBe(0);
  });
});
