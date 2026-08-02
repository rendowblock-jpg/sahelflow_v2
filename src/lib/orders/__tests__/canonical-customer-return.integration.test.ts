process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { issueCanonicalRefund, reverseCanonicalRefund } from "@/lib/accounting/canonical-refund";
import type { ServiceContext } from "@/lib/data/service-base";
import {
  requestCanonicalCustomerReturn,
  transitionCanonicalCustomerReturn,
} from "@/lib/orders/canonical-customer-return";
import { getCanonicalCustomerReturnPosition } from "@/lib/orders/canonical-customer-return-projections";
import { executeCanonicalFulfillment } from "@/lib/orders/canonical-fulfillment";
import { executeManualOrderDecision } from "@/lib/orders/manual-confirmation";
import {
  isTrustedManualOrderAuthority,
  trustedManualOrderSourceMetadata,
} from "@/lib/orders/manual-order-authority";

const db = new PrismaClient();
const context = { prisma: db as never } satisfies ServiceContext;
let sequence = 0;

function required<T>(value: T | null | undefined, label: string): T {
  if (value === null || value === undefined) {
    throw new Error(`${label} is required by the test fixture`);
  }
  return value;
}

async function clean(): Promise<void> {
  await db.$executeRawUnsafe('DELETE FROM "CanonicalRefundReversal"');
  await db.$executeRawUnsafe('DELETE FROM "CanonicalRefund"');
  await db.$executeRawUnsafe('DELETE FROM "CanonicalExchangeOrder"');
  await db.$executeRawUnsafe('DELETE FROM "CanonicalReturnInspection"');
  await db.$executeRawUnsafe('DELETE FROM "CanonicalExchangeRequestItem"');
  await db.$executeRawUnsafe('DELETE FROM "CanonicalExchangeRequest"');
  await db.$executeRawUnsafe('DELETE FROM "CanonicalReturnItem"');
  await db.$executeRawUnsafe('DELETE FROM "CanonicalReturnEvent"');
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
  await db.counter.deleteMany();
}

interface SeedOptions {
  quantity?: number;
  stock?: number;
  price?: number;
  cost?: number;
  deliveryCost?: number;
}

async function seedDeliveredOrder(options: SeedOptions = {}) {
  sequence += 1;
  const quantity = options.quantity ?? 2;
  const stock = options.stock ?? 10;
  const price = options.price ?? 2500;
  const deliveryCost = options.deliveryCost ?? 0;
  const category = await db.category.create({
    data: { name: `Customer return category ${sequence}` },
  });
  const product = await db.product.create({
    data: {
      name: `Customer return product ${sequence}`,
      price,
      cost: options.cost ?? 900,
      stock,
      categoryId: category.id,
      isActive: true,
    },
  });
  const customer = await db.customer.create({
    data: {
      name: `Customer return buyer ${sequence}`,
      phone: `customer-return-phone-${sequence}`,
      nameBlindIndex: `customer-return-name-${sequence}`,
      wilaya: "Alger",
      commune: "Alger Centre",
      address: "Test",
    },
  });
  const order = await db.order.create({
    data: {
      orderNumber: `ORD-CUSTOMER-RETURN-${sequence}`,
      status: "pending",
      version: 1,
      fulfillmentState: "unfulfilled",
      deliveryState: "not_created",
      inventoryState: "unreserved",
      codState: "not_expected",
      customerId: customer.id,
      totalPrice: price * quantity + deliveryCost,
      deliveryCost,
      wilaya: "Alger",
      commune: "Alger Centre",
      address: "Test",
      phone: `order-customer-return-phone-${sequence}`,
      source: "manual",
      sourceMetadata: trustedManualOrderSourceMetadata(),
      items: {
        create: [
          {
            productId: product.id,
            productName: product.name,
            quantity,
            unitPrice: price,
            total: price * quantity,
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
    idempotencyKey: `customer-return-confirm-${sequence}`,
  });
  await executeCanonicalFulfillment(context, {
    orderId: order.id,
    action: "pack",
    expectedVersion: 2,
    idempotencyKey: `customer-return-pack-${sequence}`,
  });
  await executeCanonicalFulfillment(context, {
    orderId: order.id,
    action: "ship",
    expectedVersion: 3,
    idempotencyKey: `customer-return-ship-${sequence}`,
  });
  await executeCanonicalFulfillment(context, {
    orderId: order.id,
    action: "deliver",
    expectedVersion: 4,
    idempotencyKey: `customer-return-deliver-${sequence}`,
  });
  return { order, product, customer };
}

async function requestReturn(input: {
  orderId: string;
  expectedVersion: number;
  orderItemId: string;
  quantity: number;
  caseType?: "return" | "exchange";
  exchangeItems?: Array<{
    productId: string;
    productVariantId?: string | null;
    quantity: number;
  }>;
  exchangeDeliveryCost?: number;
  key: string;
}) {
  return requestCanonicalCustomerReturn(context, {
    orderId: input.orderId,
    expectedVersion: input.expectedVersion,
    caseType: input.caseType ?? "return",
    reasonCode: "customer-requested-return",
    items: [{ orderItemId: input.orderItemId, quantity: input.quantity }],
    exchangeItems: input.exchangeItems,
    exchangeDeliveryCost: input.exchangeDeliveryCost ?? 0,
    occurredAt: new Date("2026-07-30T13:00:00.000Z"),
    idempotencyKey: input.key,
  });
}

async function transition(input: {
  orderId: string;
  returnId: string;
  action:
    | "approve"
    | "reject"
    | "cancel"
    | "mark_in_transit"
    | "receive"
    | "inspect"
    | "complete";
  expectedVersion: number;
  key: string;
  items?: Array<{
    orderItemId: string;
    quantity: number;
    disposition: "available" | "damaged" | "quarantine" | "lost";
  }>;
}) {
  return transitionCanonicalCustomerReturn(context, {
    orderId: input.orderId,
    returnId: input.returnId,
    action: input.action,
    expectedVersion: input.expectedVersion,
    reasonCode: `customer-return-${input.action.replaceAll("_", "-")}`,
    occurredAt: new Date("2026-07-30T13:05:00.000Z"),
    items: input.items,
    idempotencyKey: input.key,
  });
}

async function completeReturn(input: {
  orderId: string;
  returnId: string;
  orderItemId: string;
  quantity: number;
  startVersion: number;
  disposition?: "available" | "damaged" | "quarantine" | "lost";
}) {
  const approved = await transition({
    orderId: input.orderId,
    returnId: input.returnId,
    action: "approve",
    expectedVersion: input.startVersion,
    key: `return-approve-${sequence}-${input.startVersion}`,
  });
  const received = await transition({
    orderId: input.orderId,
    returnId: input.returnId,
    action: "receive",
    expectedVersion: approved.result.orderVersion,
    key: `return-receive-${sequence}-${input.startVersion}`,
  });
  const inspected = await transition({
    orderId: input.orderId,
    returnId: input.returnId,
    action: "inspect",
    expectedVersion: received.result.orderVersion,
    key: `return-inspect-${sequence}-${input.startVersion}`,
    items: [
      {
        orderItemId: input.orderItemId,
        quantity: input.quantity,
        disposition: input.disposition ?? "available",
      },
    ],
  });
  const completed = await transition({
    orderId: input.orderId,
    returnId: input.returnId,
    action: "complete",
    expectedVersion: inspected.result.orderVersion,
    key: `return-complete-${sequence}-${input.startVersion}`,
  });
  return { approved, received, inspected, completed };
}

beforeEach(clean);
afterAll(async () => {
  await clean();
  await db.$disconnect();
});

describe("canonical customer returns, exchanges and refunds", () => {
  it("completes a partial return without turning the delivered order into a full return", async () => {
    const { order, product, customer } = await seedDeliveredOrder({
      quantity: 2,
      stock: 10,
    });
    const orderItem = required(order.items[0], "order item");
    expect(await db.product.findUnique({ where: { id: product.id } })).toMatchObject({
      stock: 8,
    });

    const requested = await requestReturn({
      orderId: order.id,
      expectedVersion: 5,
      orderItemId: orderItem.id,
      quantity: 1,
      key: "customer-return-partial-request",
    });
    const lifecycle = await completeReturn({
      orderId: order.id,
      returnId: requested.result.returnId,
      orderItemId: orderItem.id,
      quantity: 1,
      startVersion: requested.result.orderVersion,
    });

    expect(lifecycle.completed.result).toMatchObject({
      status: "delivered",
      returnState: "completed",
      fullOrderReturn: false,
      availableQuantity: 0,
    });
    expect(await db.product.findUnique({ where: { id: product.id } })).toMatchObject({
      stock: 9,
    });
    expect(await db.customer.findUnique({ where: { id: customer.id } })).toMatchObject({
      orderCount: 1,
      totalSpent: 5000,
    });
    const position = await getCanonicalCustomerReturnPosition(context, order.id);
    expect(position.returnCase).toMatchObject({
      currentState: "completed",
      fullOrderReturn: false,
      itemValue: 2500,
    });
  });

  it("creates a pending server-priced replacement order only after a full exchange completes", async () => {
    const { order, product, customer } = await seedDeliveredOrder({
      quantity: 1,
      stock: 5,
      price: 2400,
    });
    const orderItem = required(order.items[0], "order item");
    const replacement = await db.product.create({
      data: {
        name: `Replacement ${sequence}`,
        price: 3900,
        cost: 1200,
        stock: 7,
        isActive: true,
      },
    });

    const requested = await requestReturn({
      orderId: order.id,
      expectedVersion: 5,
      orderItemId: orderItem.id,
      quantity: 1,
      caseType: "exchange",
      exchangeItems: [{ productId: replacement.id, quantity: 2 }],
      exchangeDeliveryCost: 300,
      key: "customer-exchange-request",
    });
    expect(await db.order.count()).toBe(1);

    const lifecycle = await completeReturn({
      orderId: order.id,
      returnId: requested.result.returnId,
      orderItemId: orderItem.id,
      quantity: 1,
      startVersion: requested.result.orderVersion,
    });
    const replacementOrderId = required(
      lifecycle.completed.result.replacementOrderId,
      "replacement order id",
    );
    const replacementOrder = await db.order.findUnique({
      where: { id: replacementOrderId },
      include: { items: true },
    });

    expect(lifecycle.completed.result).toMatchObject({
      status: "returned",
      returnState: "completed",
      fullOrderReturn: true,
    });
    expect(replacementOrder).toMatchObject({
      status: "pending",
      version: 1,
      totalPrice: 8100,
      deliveryCost: 300,
      customerId: customer.id,
      fulfillmentState: "unfulfilled",
      deliveryState: "not_created",
      inventoryState: "unreserved",
      codState: "not_expected",
    });
    expect(replacementOrder?.items).toEqual([
      expect.objectContaining({
        productId: replacement.id,
        quantity: 2,
        unitPrice: 3900,
        total: 7800,
      }),
    ]);
    expect(
      isTrustedManualOrderAuthority(
        replacementOrder?.source,
        replacementOrder?.sourceMetadata,
      ),
    ).toBe(true);
    expect(await db.product.findUnique({ where: { id: replacement.id } })).toMatchObject({
      stock: 7,
    });
    expect(await db.product.findUnique({ where: { id: product.id } })).toMatchObject({
      stock: 5,
    });
    expect(await db.customer.findUnique({ where: { id: customer.id } })).toMatchObject({
      orderCount: 0,
      totalSpent: 2400,
    });
  });

  it("issues partial and full refunds and reverses an exact amount without touching stock", async () => {
    const { order, product, customer } = await seedDeliveredOrder({
      quantity: 1,
      stock: 5,
      price: 2500,
    });
    const orderItem = required(order.items[0], "order item");
    const requested = await requestReturn({
      orderId: order.id,
      expectedVersion: 5,
      orderItemId: orderItem.id,
      quantity: 1,
      key: "refund-return-request",
    });
    const lifecycle = await completeReturn({
      orderId: order.id,
      returnId: requested.result.returnId,
      orderItemId: orderItem.id,
      quantity: 1,
      startVersion: requested.result.orderVersion,
    });

    const partial = await issueCanonicalRefund(context, {
      orderId: order.id,
      returnId: requested.result.returnId,
      expectedVersion: lifecycle.completed.result.orderVersion,
      amount: 1000,
      method: "cash",
      reasonCode: "partial-customer-refund",
      occurredAt: new Date("2026-07-30T13:10:00.000Z"),
      idempotencyKey: "canonical-refund-partial",
    });
    const replay = await issueCanonicalRefund(context, {
      orderId: order.id,
      returnId: requested.result.returnId,
      expectedVersion: lifecycle.completed.result.orderVersion,
      amount: 1000,
      method: "cash",
      reasonCode: "partial-customer-refund",
      occurredAt: new Date("2026-07-30T13:10:00.000Z"),
      idempotencyKey: "canonical-refund-partial",
    });
    expect(replay).toEqual({ ...partial, replayed: true });
    expect(partial.result).toMatchObject({
      effectiveRefundAmount: 1000,
      refundState: "partially_refunded",
    });

    const full = await issueCanonicalRefund(context, {
      orderId: order.id,
      returnId: requested.result.returnId,
      expectedVersion: partial.result.orderVersion,
      amount: 1500,
      method: "bank",
      reference: "BANK-REFUND-1",
      reasonCode: "complete-customer-refund",
      occurredAt: new Date("2026-07-30T13:11:00.000Z"),
      idempotencyKey: "canonical-refund-complete",
    });
    expect(full.result).toMatchObject({
      effectiveRefundAmount: 2500,
      remainingRefundableAmount: 0,
      refundState: "refunded",
    });

    const reversed = await reverseCanonicalRefund(context, {
      orderId: order.id,
      refundId: partial.result.refundId,
      expectedVersion: full.result.orderVersion,
      amount: 400,
      reasonCode: "refund-overpayment-correction",
      occurredAt: new Date("2026-07-30T13:12:00.000Z"),
      idempotencyKey: "canonical-refund-reversal",
    });
    expect(reversed.result).toMatchObject({
      effectiveRefundAmount: 2100,
      refundState: "partially_reversed",
    });
    expect(await db.customer.findUnique({ where: { id: customer.id } })).toMatchObject({
      totalSpent: 400,
    });
    expect(await db.product.findUnique({ where: { id: product.id } })).toMatchObject({
      stock: 5,
    });
    expect(await db.canonicalRefund.count()).toBe(2);
    expect(await db.canonicalRefundReversal.count()).toBe(1);
    const movements = await db.financialMovement.findMany({
      where: {
        orderId: order.id,
        movementType: {
          in: ["customer_refund_issued", "customer_refund_reversed"],
        },
      },
      select: { movementType: true, amount: true },
      orderBy: { occurredAt: "asc" },
    });
    expect(movements).toEqual([
      { movementType: "customer_refund_issued", amount: -1000 },
      { movementType: "customer_refund_issued", amount: -1500 },
      { movementType: "customer_refund_reversed", amount: 400 },
    ]);
  });

  it("does not refund more than the exact partial-return value", async () => {
    const { order } = await seedDeliveredOrder({
      quantity: 2,
      stock: 10,
      price: 2000,
      deliveryCost: 400,
    });
    const orderItem = required(order.items[0], "order item");
    const requested = await requestReturn({
      orderId: order.id,
      expectedVersion: 5,
      orderItemId: orderItem.id,
      quantity: 1,
      key: "partial-limit-return-request",
    });
    const lifecycle = await completeReturn({
      orderId: order.id,
      returnId: requested.result.returnId,
      orderItemId: orderItem.id,
      quantity: 1,
      startVersion: requested.result.orderVersion,
    });

    await expect(
      issueCanonicalRefund(context, {
        orderId: order.id,
        returnId: requested.result.returnId,
        expectedVersion: lifecycle.completed.result.orderVersion,
        amount: 2001,
        method: "cash",
        reasonCode: "invalid-over-refund",
        occurredAt: new Date("2026-07-30T13:15:00.000Z"),
        idempotencyKey: "partial-return-over-refund",
      }),
    ).rejects.toThrow(/exact returned item value/i);
    await expect(
      issueCanonicalRefund(context, {
        orderId: order.id,
        returnId: requested.result.returnId,
        expectedVersion: lifecycle.completed.result.orderVersion,
        amount: 2000,
        method: "cash",
        includeDeliveryCost: true,
        reasonCode: "invalid-delivery-refund",
        occurredAt: new Date("2026-07-30T13:16:00.000Z"),
        idempotencyKey: "partial-return-delivery-refund",
      }),
    ).rejects.toThrow(/full-order return/i);
    expect(await db.canonicalRefund.count()).toBe(0);
  });

  it("allows only one concurrent return request for the order", async () => {
    const { order } = await seedDeliveredOrder({ quantity: 1 });
    const orderItem = required(order.items[0], "order item");

    const outcomes = await Promise.allSettled([
      requestReturn({
        orderId: order.id,
        expectedVersion: 5,
        orderItemId: orderItem.id,
        quantity: 1,
        key: "return-request-race-a",
      }),
      requestReturn({
        orderId: order.id,
        expectedVersion: 5,
        orderItemId: orderItem.id,
        quantity: 1,
        key: "return-request-race-b",
      }),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
    expect(await db.canonicalReturnCase.count({ where: { orderId: order.id } })).toBe(1);
  });

  it("rejects out-of-order inspection without stock, inspection or projection changes", async () => {
    const { order, product } = await seedDeliveredOrder({ quantity: 1, stock: 5 });
    const orderItem = required(order.items[0], "order item");
    const requested = await requestReturn({
      orderId: order.id,
      expectedVersion: 5,
      orderItemId: orderItem.id,
      quantity: 1,
      key: "out-of-order-return-request",
    });

    await expect(
      transition({
        orderId: order.id,
        returnId: requested.result.returnId,
        action: "inspect",
        expectedVersion: requested.result.orderVersion,
        key: "out-of-order-return-inspection",
        items: [
          {
            orderItemId: orderItem.id,
            quantity: 1,
            disposition: "available",
          },
        ],
      }),
    ).rejects.toThrow(/requires received state/i);

    expect(await db.product.findUnique({ where: { id: product.id } })).toMatchObject({
      stock: 4,
    });
    expect(await db.canonicalReturnInspection.count()).toBe(0);
    expect(await getCanonicalCustomerReturnPosition(context, order.id)).toMatchObject({
      orderVersion: requested.result.orderVersion,
      availableActions: ["approve", "reject", "cancel"],
    });
  });
});
