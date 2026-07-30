process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { ServiceContext } from "@/lib/data/service-base";
import { trustedManualOrderSourceMetadata } from "../manual-order-authority";
import { executeManualOrderDecision } from "../manual-confirmation";

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

async function count(table: string): Promise<number> {
  const allowed = new Set([
    "AuditLog",
    "BusinessAggregateVersion",
    "BusinessCommand",
    "DomainEvent",
    "OutboxIntent",
    "InventoryReservation",
    "InventoryMovement",
    "ProjectionInvalidation",
  ]);
  if (!allowed.has(table)) throw new Error(`unsupported table ${table}`);
  const rows = await db.$queryRawUnsafe<Array<{ total: number | bigint }>>(
    `SELECT COUNT(*) AS total FROM "${table}"`,
  );
  return Number(rows[0]?.total ?? 0);
}

async function seedProduct(stock: number, lowStockThreshold = 2) {
  sequence += 1;
  const category = await db.category.create({
    data: { name: `Canonical category ${sequence}` },
  });
  return db.product.create({
    data: {
      name: `Canonical product ${sequence}`,
      price: 2500,
      stock,
      lowStockThreshold,
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
      name: `Canonical customer ${sequence}`,
      phone: `canonical-phone-${sequence}`,
      nameBlindIndex: `canonical-name-${sequence}`,
      wilaya: "Alger",
      commune: "Alger Centre",
      address: "Test",
    },
  });
  return db.order.create({
    data: {
      orderNumber: `ORD-CANONICAL-${sequence}`,
      status: "pending",
      version: 1,
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
          productName: "Canonical product",
          productVariantName: options.productVariantId
            ? "Canonical variant"
            : null,
          quantity: options.quantity,
          unitPrice: 2500,
          total: 2500 * options.quantity,
        }],
      },
    },
    include: { items: true },
  });
}

function confirm(orderId: string, idempotencyKey: string) {
  return {
    orderId,
    decision: "confirm" as const,
    expectedVersion: 1,
    idempotencyKey,
    correlationId: `${idempotencyKey}-correlation`,
  };
}

beforeEach(clean);
afterAll(async () => {
  await clean();
  await db.$disconnect();
});

describe("canonical manual confirmation", () => {
  it("commits order, stock, reservation, movement, audit, event and outbox atomically", async () => {
    const product = await seedProduct(10);
    const order = await seedOrder({ productId: product.id, quantity: 2 });

    const result = await executeManualOrderDecision(
      context,
      confirm(order.id, "canonical-confirm-success"),
    );

    expect(result).toMatchObject({ replayed: false, aggregateVersion: 1 });
    expect(result.result).toMatchObject({
      orderId: order.id,
      status: "confirmed",
      version: 2,
    });
    expect(await db.order.findUnique({ where: { id: order.id } })).toMatchObject({
      status: "confirmed",
      version: 2,
    });
    expect(await db.product.findUnique({ where: { id: product.id } })).toMatchObject({
      stock: 8,
    });
    expect(await count("BusinessAggregateVersion")).toBe(1);
    expect(await count("BusinessCommand")).toBe(1);
    expect(await count("AuditLog")).toBe(1);
    expect(await count("DomainEvent")).toBe(1);
    expect(await count("OutboxIntent")).toBe(1);
    expect(await count("InventoryReservation")).toBe(1);
    expect(await count("InventoryMovement")).toBe(1);
    expect(await count("ProjectionInvalidation")).toBeGreaterThanOrEqual(4);
  });

  it("replays the exact command without duplicating stock or facts", async () => {
    const product = await seedProduct(5);
    const order = await seedOrder({ productId: product.id, quantity: 1 });
    const input = confirm(order.id, "canonical-confirm-replay");

    const first = await executeManualOrderDecision(context, input);
    const replay = await executeManualOrderDecision(context, input);

    expect(replay).toEqual({ ...first, replayed: true });
    expect(await db.product.findUnique({ where: { id: product.id } })).toMatchObject({
      stock: 4,
    });
    expect(await count("BusinessCommand")).toBe(1);
    expect(await count("InventoryReservation")).toBe(1);
  });

  it("rolls back every fact when exact availability is insufficient", async () => {
    const product = await seedProduct(1);
    const order = await seedOrder({ productId: product.id, quantity: 2 });

    await expect(
      executeManualOrderDecision(
        context,
        confirm(order.id, "canonical-confirm-insufficient"),
      ),
    ).rejects.toThrow(/insufficient available stock/i);

    expect(await db.order.findUnique({ where: { id: order.id } })).toMatchObject({
      status: "pending",
      version: 1,
    });
    expect(await db.product.findUnique({ where: { id: product.id } })).toMatchObject({
      stock: 1,
    });
    expect(await count("BusinessCommand")).toBe(0);
    expect(await count("InventoryReservation")).toBe(0);
    expect(await count("InventoryMovement")).toBe(0);
  });

  it("allows only one competing order to reserve the final unit", async () => {
    const product = await seedProduct(1);
    const first = await seedOrder({ productId: product.id, quantity: 1 });
    const second = await seedOrder({ productId: product.id, quantity: 1 });

    const outcomes = await Promise.allSettled([
      executeManualOrderDecision(
        context,
        confirm(first.id, "canonical-race-first"),
      ),
      executeManualOrderDecision(
        context,
        confirm(second.id, "canonical-race-second"),
      ),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
    expect(await db.product.findUnique({ where: { id: product.id } })).toMatchObject({
      stock: 0,
    });
    expect(await count("InventoryReservation")).toBe(1);
  });

  it("reserves the exact active variant and repairs the parent availability projection", async () => {
    const product = await seedProduct(3);
    const black = await db.productVariant.create({
      data: {
        productId: product.id,
        name: "Black",
        stock: 1,
        isActive: true,
      },
    });
    await db.productVariant.create({
      data: {
        productId: product.id,
        name: "White",
        stock: 2,
        isActive: true,
      },
    });
    const order = await seedOrder({
      productId: product.id,
      productVariantId: black.id,
      quantity: 1,
    });

    await executeManualOrderDecision(
      context,
      confirm(order.id, "canonical-variant-success"),
    );

    expect(await db.productVariant.findUnique({ where: { id: black.id } })).toMatchObject({
      stock: 0,
    });
    expect(await db.product.findUnique({ where: { id: product.id } })).toMatchObject({
      stock: 2,
    });
    const reservations = await db.$queryRaw<
      Array<{ productVariantId: string | null }>
    >`
      SELECT "productVariantId"
      FROM "InventoryReservation"
      WHERE "orderId" = ${order.id}
    `;
    expect(reservations).toEqual([{ productVariantId: black.id }]);
  });

  it("rejects without moving stock and records the encrypted command result", async () => {
    const product = await seedProduct(5);
    const order = await seedOrder({ productId: product.id, quantity: 2 });

    const result = await executeManualOrderDecision(context, {
      ...confirm(order.id, "canonical-reject-success"),
      decision: "reject",
      reason: "Customer declined by phone",
    });

    expect(result.result).toMatchObject({
      status: "cancelled",
      version: 2,
      rejectionReason: "Customer declined by phone",
    });
    expect(await db.product.findUnique({ where: { id: product.id } })).toMatchObject({
      stock: 5,
    });
    expect(await count("InventoryReservation")).toBe(0);
    expect(await count("InventoryMovement")).toBe(0);
  });

  it("emits a low-stock event only when confirmation crosses the threshold", async () => {
    const product = await seedProduct(6, 5);
    const order = await seedOrder({ productId: product.id, quantity: 2 });

    await executeManualOrderDecision(
      context,
      confirm(order.id, "canonical-low-stock-crossing"),
    );

    const events = await db.$queryRaw<Array<{ eventType: string }>>`
      SELECT "eventType" FROM "DomainEvent" ORDER BY "eventType" ASC
    `;
    expect(events.map((event) => event.eventType)).toEqual([
      "order.confirmation.confirmed.v1",
      "stock.low.v1",
    ]);
    expect(await count("OutboxIntent")).toBe(2);
  });
});
