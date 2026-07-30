process.env.SF_MASTER_KEY = process.env.SF_MASTER_KEY ?? "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { ServiceContext } from "@/lib/data/service-base";
import { executeManualOrderDecision } from "../manual-confirmation";
import { trustedManualOrderSourceMetadata } from "../manual-order-authority";

const db = new PrismaClient();
const context = { prisma: db as never } satisfies ServiceContext;
let sequence = 0;
let subscribers: {
  confirmed: string;
  cancelled: string;
  stockLow: string;
};

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
  await db.automationLog.deleteMany();
  await db.automation.deleteMany();
  await db.auditLog.deleteMany();
  await db.orderChange.deleteMany();
  await db.orderItem.deleteMany();
  await db.order.deleteMany();
  await db.productVariant.deleteMany();
  await db.product.deleteMany();
  await db.category.deleteMany();
  await db.customer.deleteMany();
}

async function seedSubscribers(): Promise<typeof subscribers> {
  const [confirmed, cancelled, stockLow] = await Promise.all([
    db.automation.create({
      data: {
        name: "Confirmation subscriber",
        trigger: "order.confirmed",
        action: "send_notification",
        config: JSON.stringify({ messageTemplate: "Confirmed" }),
      },
    }),
    db.automation.create({
      data: {
        name: "Rejection subscriber",
        trigger: "order.cancelled",
        action: "send_notification",
        config: JSON.stringify({ messageTemplate: "Rejected" }),
      },
    }),
    db.automation.create({
      data: {
        name: "Low-stock subscriber",
        trigger: "stock.low",
        action: "send_notification",
        config: JSON.stringify({ messageTemplate: "Low stock" }),
      },
    }),
  ]);
  return {
    confirmed: confirmed.id,
    cancelled: cancelled.id,
    stockLow: stockLow.id,
  };
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

async function outboxEffectKeys(commandId: string): Promise<string[]> {
  const rows = await db.$queryRaw<Array<{ effectKey: string }>>`
    SELECT "effectKey"
    FROM "OutboxIntent"
    WHERE "commandId" = ${commandId}
    ORDER BY "effectKey" ASC
  `;
  return rows.map((row) => row.effectKey);
}

async function seedCustomer() {
  sequence += 1;
  return db.customer.create({
    data: {
      name: `Manual Customer ${sequence}`,
      phone: `manual-phone-${sequence}`,
      nameBlindIndex: `manual-name-${sequence}`,
      wilaya: "Alger",
      commune: "Alger Centre",
      address: "Test",
    },
  });
}

async function seedProduct(stock: number, lowStockThreshold = 5) {
  sequence += 1;
  const category = await db.category.create({
    data: { name: `Manual Cat ${sequence}` },
  });
  return db.product.create({
    data: {
      name: `Manual Product ${sequence}`,
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
  productVariantId?: string | null;
  quantity: number;
  trusted?: boolean;
}) {
  sequence += 1;
  const customer = await seedCustomer();
  return db.order.create({
    data: {
      orderNumber: `ORD-MANUAL-${sequence}`,
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
      sourceMetadata:
        options.trusted === false ? null : trustedManualOrderSourceMetadata(),
      items: {
        create: [
          {
            productId: options.productId,
            productVariantId: options.productVariantId ?? null,
            productName: "Canonical product",
            productVariantName: options.productVariantId
              ? "Canonical variant"
              : null,
            quantity: options.quantity,
            unitPrice: 2500,
            total: 2500 * options.quantity,
          },
        ],
      },
    },
    include: { items: true },
  });
}

function decision(
  orderId: string,
  idempotencyKey: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    orderId,
    decision: "confirm",
    expectedVersion: 1,
    idempotencyKey,
    correlationId: `${idempotencyKey}-correlation`,
    ...overrides,
  };
}

function decisionEffectKey(commandId: string, automationId: string): string {
  return `${commandId}:automation:order-decision:${automationId}`;
}

function stockLowEffectKey(
  commandId: string,
  productId: string,
  automationId: string,
): string {
  return `${commandId}:automation:stock-low:${productId}:${automationId}`;
}

beforeEach(async () => {
  await clean();
  subscribers = await seedSubscribers();
});
afterAll(async () => {
  await clean();
  await db.$disconnect();
});

describe("manual order confirmation", () => {
  it("atomically confirms, reserves product stock and persists canonical facts", async () => {
    const product = await seedProduct(5);
    const order = await seedOrder({ productId: product.id, quantity: 2 });

    const result = await executeManualOrderDecision(
      context,
      decision(order.id, "manual-confirm-success"),
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
      stock: 3,
    });
    expect(await count("BusinessAggregateVersion")).toBe(1);
    expect(await count("BusinessCommand")).toBe(1);
    expect(await count("AuditLog")).toBe(1);
    expect(await count("DomainEvent")).toBe(1);
    expect(await count("OutboxIntent")).toBe(2);
    expect(await outboxEffectKeys(result.commandId)).toEqual([
      decisionEffectKey(result.commandId, subscribers.confirmed),
      stockLowEffectKey(result.commandId, product.id, subscribers.stockLow),
    ].sort());
    expect(await count("InventoryReservation")).toBe(1);
    expect(await count("InventoryMovement")).toBe(1);
    expect(await count("ProjectionInvalidation")).toBeGreaterThanOrEqual(4);
  });

  it("rejects a source-manual row without trusted authority metadata", async () => {
    const product = await seedProduct(5);
    const order = await seedOrder({
      productId: product.id,
      quantity: 1,
      trusted: false,
    });

    await expect(
      executeManualOrderDecision(
        context,
        decision(order.id, "untrusted-manual-confirm"),
      ),
    ).rejects.toThrow(/trusted manual orders/i);

    expect(await db.order.findUnique({ where: { id: order.id } })).toMatchObject({
      status: "pending",
      version: 1,
    });
    expect(await db.product.findUnique({ where: { id: product.id } })).toMatchObject({
      stock: 5,
    });
    expect(await count("BusinessCommand")).toBe(0);
  });

  it("requires a rejection reason before entering the command transaction", async () => {
    const product = await seedProduct(5);
    const order = await seedOrder({ productId: product.id, quantity: 1 });

    await expect(
      executeManualOrderDecision(
        context,
        decision(order.id, "manual-reject-no-reason", {
          decision: "reject",
        }),
      ),
    ).rejects.toThrow(/requires a reason/i);

    expect(await count("BusinessCommand")).toBe(0);
    expect(await db.order.findUnique({ where: { id: order.id } })).toMatchObject({
      status: "pending",
      version: 1,
    });
  });

  it("does not queue a low-stock effect while availability remains above threshold", async () => {
    const product = await seedProduct(20, 5);
    const order = await seedOrder({ productId: product.id, quantity: 2 });

    const result = await executeManualOrderDecision(
      context,
      decision(order.id, "manual-confirm-not-low"),
    );

    expect(await db.product.findUnique({ where: { id: product.id } })).toMatchObject({
      stock: 18,
    });
    expect(await outboxEffectKeys(result.commandId)).toEqual([
      decisionEffectKey(result.commandId, subscribers.confirmed),
    ]);
  });

  it("returns the original result for an exact same-key retry and rejects changed content", async () => {
    const product = await seedProduct(5);
    const order = await seedOrder({ productId: product.id, quantity: 1 });
    const input = decision(order.id, "manual-confirm-replay");

    const first = await executeManualOrderDecision(context, input);
    const replay = await executeManualOrderDecision(context, input);

    expect(replay).toEqual({ ...first, replayed: true });
    expect(await count("BusinessCommand")).toBe(1);
    expect(await count("InventoryReservation")).toBe(1);

    await expect(
      executeManualOrderDecision(context, {
        ...input,
        decision: "reject",
        reason: "changed content",
      }),
    ).rejects.toThrow(/different command content/i);
  });

  it("rolls back order, stock and every canonical fact when availability is insufficient", async () => {
    const product = await seedProduct(1);
    const order = await seedOrder({ productId: product.id, quantity: 2 });

    await expect(
      executeManualOrderDecision(
        context,
        decision(order.id, "manual-confirm-insufficient"),
      ),
    ).rejects.toThrow(/insufficient available stock/i);

    expect(await db.order.findUnique({ where: { id: order.id } })).toMatchObject({
      status: "pending",
      version: 1,
    });
    expect(await db.product.findUnique({ where: { id: product.id } })).toMatchObject({
      stock: 1,
    });
    expect(await count("BusinessAggregateVersion")).toBe(0);
    expect(await count("BusinessCommand")).toBe(0);
    expect(await count("InventoryReservation")).toBe(0);
    expect(await count("InventoryMovement")).toBe(0);
  });

  it("allows only one of two competing orders to reserve the final unit", async () => {
    const product = await seedProduct(1);
    const firstOrder = await seedOrder({ productId: product.id, quantity: 1 });
    const secondOrder = await seedOrder({ productId: product.id, quantity: 1 });

    const outcomes = await Promise.allSettled([
      executeManualOrderDecision(
        context,
        decision(firstOrder.id, "manual-race-first"),
      ),
      executeManualOrderDecision(
        context,
        decision(secondOrder.id, "manual-race-second"),
      ),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
    expect(await db.product.findUnique({ where: { id: product.id } })).toMatchObject({
      stock: 0,
    });
    expect(await count("InventoryReservation")).toBe(1);
  });

  it("requires and reserves the exact active variant and repairs parent availability projection", async () => {
    const product = await seedProduct(99);
    const first = await db.productVariant.create({
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
      productVariantId: first.id,
      quantity: 1,
    });

    const result = await executeManualOrderDecision(
      context,
      decision(order.id, "manual-variant-success"),
    );

    expect(await db.productVariant.findUnique({ where: { id: first.id } })).toMatchObject({
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
    expect(reservations).toEqual([{ productVariantId: first.id }]);
    expect(await outboxEffectKeys(result.commandId)).toContain(
      stockLowEffectKey(result.commandId, product.id, subscribers.stockLow),
    );
  });

  it("rejects a pending manual order without moving stock", async () => {
    const product = await seedProduct(5);
    const order = await seedOrder({ productId: product.id, quantity: 2 });

    const result = await executeManualOrderDecision(
      context,
      decision(order.id, "manual-reject-success", {
        decision: "reject",
        reason: "Customer declined by phone",
      }),
    );

    expect(result).toMatchObject({ aggregateVersion: 1 });
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
    expect(await outboxEffectKeys(result.commandId)).toEqual([
      decisionEffectKey(result.commandId, subscribers.cancelled),
    ]);
  });
});
