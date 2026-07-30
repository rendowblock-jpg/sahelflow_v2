process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  correctCanonicalCodCollection,
  correctCanonicalCodSettlementLine,
  matchCanonicalCodSettlementLine,
  postCanonicalCodSettlement,
  recordCanonicalCodCollection,
} from "@/lib/accounting/canonical-cod";
import { getCanonicalCodWorkspaceSummary } from "@/lib/accounting/canonical-cod-projections";
import type { ServiceContext } from "@/lib/data/service-base";
import { executeManualOrderDecision } from "@/lib/orders/manual-confirmation";
import { trustedManualOrderSourceMetadata } from "@/lib/orders/manual-order-authority";
import { executeCanonicalFulfillment } from "@/lib/orders/canonical-fulfillment";

const db = new PrismaClient();
const context = { prisma: db as never } satisfies ServiceContext;
let sequence = 0;

async function clean(): Promise<void> {
  await db.codSettlementLineMatch.deleteMany();
  await db.codSettlementCorrection.deleteMany();
  await db.codSettlementLine.deleteMany();
  await db.codSettlement.deleteMany();
  await db.codCollectionCorrection.deleteMany();
  await db.codCollection.deleteMany();
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

async function seedDeliveredOrder(quantity = 2) {
  sequence += 1;
  const category = await db.category.create({
    data: { name: `COD category ${sequence}` },
  });
  const product = await db.product.create({
    data: {
      name: `COD product ${sequence}`,
      price: 2500,
      stock: 20,
      categoryId: category.id,
      isActive: true,
    },
  });
  const customer = await db.customer.create({
    data: {
      name: `COD customer ${sequence}`,
      phone: `cod-phone-${sequence}`,
      nameBlindIndex: `cod-name-${sequence}`,
      wilaya: "Alger",
      commune: "Alger Centre",
      address: "Test",
    },
  });
  const order = await db.order.create({
    data: {
      orderNumber: `ORD-COD-${sequence}`,
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
      phone: `cod-order-${sequence}`,
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
    idempotencyKey: `cod-confirm-${sequence}`,
  });
  await executeCanonicalFulfillment(context, {
    orderId: order.id,
    action: "pack",
    expectedVersion: 2,
    idempotencyKey: `cod-pack-${sequence}`,
  });
  await executeCanonicalFulfillment(context, {
    orderId: order.id,
    action: "ship",
    expectedVersion: 3,
    idempotencyKey: `cod-ship-${sequence}`,
  });
  await executeCanonicalFulfillment(context, {
    orderId: order.id,
    action: "deliver",
    expectedVersion: 4,
    idempotencyKey: `cod-deliver-${sequence}`,
  });
  return { order, customer, product, receivable: 2500 * quantity };
}

function collect(input: {
  orderId: string;
  expectedVersion: number;
  amount: number;
  key: string;
  provider?: string;
}) {
  return recordCanonicalCodCollection(context, {
    orderId: input.orderId,
    expectedVersion: input.expectedVersion,
    amount: input.amount,
    provider: input.provider ?? "manual-courier",
    reference: `COL-${input.key}`,
    collectedAt: new Date("2026-07-30T10:00:00.000Z"),
    idempotencyKey: input.key,
  });
}

beforeEach(clean);
afterAll(async () => {
  await clean();
  await db.$disconnect();
});

describe("canonical COD collection, settlement and reconciliation", () => {
  it("uses the immutable receivable movement instead of mutable order totals", async () => {
    const { order, receivable } = await seedDeliveredOrder(2);
    await db.order.update({
      where: { id: order.id },
      data: { totalPrice: 9999 },
    });

    const result = await collect({
      orderId: order.id,
      expectedVersion: 5,
      amount: receivable,
      key: "cod-ledger-authority",
    });

    expect(result.result).toMatchObject({
      expectedAmount: receivable,
      discrepancyAmount: 0,
      codState: "collected",
      version: 6,
    });
    expect(await db.order.findUnique({ where: { id: order.id } })).toMatchObject({
      totalPrice: 9999,
      codState: "collected",
      codCollected: true,
      version: 6,
    });
  });

  it("posts the settlement parent before its lines and records fees without reducing gross reconciliation", async () => {
    const { order, receivable } = await seedDeliveredOrder(2);
    await collect({
      orderId: order.id,
      expectedVersion: 5,
      amount: receivable,
      key: "cod-settlement-parent",
    });

    const settled = await postCanonicalCodSettlement(context, {
      provider: "manual-courier",
      externalReference: "REM-PARENT-1",
      receivedAt: new Date("2026-07-30T11:00:00.000Z"),
      idempotencyKey: "cod-settlement-parent-post",
      lines: [{
        providerLineReference: "LINE-PARENT-1",
        orderId: order.id,
        expectedVersion: 6,
        grossRemittedAmount: receivable,
        feeAmount: 250,
        adjustmentAmount: 0,
        isFinal: true,
      }],
    });

    expect(settled.result).toMatchObject({
      status: "posted",
      grossAmount: receivable,
      feeAmount: 250,
      netAmount: receivable - 250,
      discrepancyAmount: 0,
    });
    expect(settled.result.lines[0]).toMatchObject({
      status: "matched",
      remainingAfter: 0,
      codState: "remitted",
      orderVersion: 7,
    });
    expect(await db.codSettlement.count()).toBe(1);
    expect(await db.codSettlementLine.count()).toBe(1);
    expect(await db.order.findUnique({ where: { id: order.id } })).toMatchObject({
      version: 7,
      codState: "remitted",
      codRemitted: true,
      codRemittanceRef: "REM-PARENT-1",
    });
    const fee = await db.financialMovement.findFirst({
      where: { orderId: order.id, movementType: "courier_fee_withheld" },
    });
    expect(fee?.amount).toBe(-250);
  });

  it("supports partial remittance followed by an exact final remittance", async () => {
    const { order, receivable } = await seedDeliveredOrder(2);
    await collect({
      orderId: order.id,
      expectedVersion: 5,
      amount: receivable,
      key: "cod-partial-collection",
    });

    const partial = await postCanonicalCodSettlement(context, {
      provider: "manual-courier",
      externalReference: "REM-PARTIAL-1",
      receivedAt: new Date("2026-07-30T11:00:00.000Z"),
      idempotencyKey: "cod-partial-first",
      lines: [{
        orderId: order.id,
        expectedVersion: 6,
        grossRemittedAmount: 2000,
        feeAmount: 100,
        isFinal: false,
      }],
    });
    expect(partial.result.lines[0]).toMatchObject({
      status: "partial",
      remainingAfter: receivable - 2000,
      codState: "partially_remitted",
      orderVersion: 7,
    });

    const final = await postCanonicalCodSettlement(context, {
      provider: "manual-courier",
      externalReference: "REM-PARTIAL-2",
      receivedAt: new Date("2026-07-30T12:00:00.000Z"),
      idempotencyKey: "cod-partial-final",
      lines: [{
        orderId: order.id,
        expectedVersion: 7,
        grossRemittedAmount: receivable - 2000,
        feeAmount: 150,
        isFinal: true,
      }],
    });
    expect(final.result.lines[0]).toMatchObject({
      status: "matched",
      remainingAfter: 0,
      codState: "remitted",
      orderVersion: 8,
    });

    const summary = await getCanonicalCodWorkspaceSummary(context);
    expect(summary.totals.grossRemitted).toBe(receivable);
    expect(summary.totals.fees).toBe(250);
    expect(summary.counts.remitted).toBe(1);
    expect(summary.awaitingRemittance).toHaveLength(0);
  });

  it("posts an unmatched provider line and later reconciles it to the correct order", async () => {
    const { order, receivable } = await seedDeliveredOrder(2);
    await collect({
      orderId: order.id,
      expectedVersion: 5,
      amount: receivable,
      key: "cod-unmatched-collection",
    });

    const settlement = await postCanonicalCodSettlement(context, {
      provider: "manual-courier",
      externalReference: "REM-UNMATCHED-1",
      receivedAt: new Date("2026-07-30T11:00:00.000Z"),
      idempotencyKey: "cod-unmatched-post",
      lines: [{
        providerLineReference: "UNKNOWN-LINE-1",
        grossRemittedAmount: receivable,
        feeAmount: 100,
        isFinal: true,
      }],
    });
    const lineId = settlement.result.lines[0]!.lineId;
    expect(settlement.result).toMatchObject({
      status: "needs_review",
      unmatchedAmount: receivable,
    });
    expect((await getCanonicalCodWorkspaceSummary(context)).reviewLines).toHaveLength(1);

    const matched = await matchCanonicalCodSettlementLine(context, {
      settlementLineId: lineId,
      orderId: order.id,
      expectedVersion: 6,
      reasonCode: "provider-reference-reconciled",
      occurredAt: new Date("2026-07-30T12:00:00.000Z"),
      idempotencyKey: "cod-unmatched-match",
    });
    expect(matched.result).toMatchObject({
      orderId: order.id,
      status: "matched",
      discrepancyAmount: 0,
      codState: "remitted",
      orderVersion: 7,
    });
    expect(await db.codSettlementLineMatch.count()).toBe(1);
    const summary = await getCanonicalCodWorkspaceSummary(context);
    expect(summary.reviewLines).toHaveLength(0);
    expect(summary.counts.settlementsNeedingReview).toBe(0);
    expect(summary.totals.unmatched).toBe(0);
  });

  it("corrects collection and settlement facts append-only and recomputes the order projection", async () => {
    const { order, receivable } = await seedDeliveredOrder(2);
    await collect({
      orderId: order.id,
      expectedVersion: 5,
      amount: receivable - 200,
      key: "cod-correction-collection",
    });
    expect(await db.order.findUnique({ where: { id: order.id } })).toMatchObject({
      codState: "disputed",
      version: 6,
    });

    const correctedCollection = await correctCanonicalCodCollection(context, {
      orderId: order.id,
      expectedVersion: 6,
      amountDelta: 200,
      reasonCode: "courier-count-corrected",
      occurredAt: new Date("2026-07-30T11:00:00.000Z"),
      idempotencyKey: "cod-correction-collection-fix",
    });
    expect(correctedCollection.result).toMatchObject({
      effectiveCollected: receivable,
      discrepancyAmount: 0,
      codState: "collected",
      version: 7,
    });
    expect(await db.codCollectionCorrection.count()).toBe(1);

    const disputed = await postCanonicalCodSettlement(context, {
      provider: "manual-courier",
      externalReference: "REM-CORRECTION-1",
      receivedAt: new Date("2026-07-30T12:00:00.000Z"),
      idempotencyKey: "cod-correction-settlement",
      lines: [{
        orderId: order.id,
        expectedVersion: 7,
        grossRemittedAmount: receivable - 100,
        feeAmount: 100,
        isFinal: true,
      }],
    });
    const lineId = disputed.result.lines[0]!.lineId;
    expect(disputed.result.lines[0]).toMatchObject({
      status: "disputed",
      discrepancyAmount: -100,
      codState: "disputed",
      orderVersion: 8,
    });

    const correctedLine = await correctCanonicalCodSettlementLine(context, {
      settlementLineId: lineId,
      expectedVersion: 8,
      grossDelta: 100,
      discrepancyDelta: 100,
      feeDelta: 50,
      reasonCode: "provider-statement-corrected",
      occurredAt: new Date("2026-07-30T13:00:00.000Z"),
      idempotencyKey: "cod-correction-settlement-fix",
    });
    expect(correctedLine.result).toMatchObject({
      effectiveGross: receivable,
      effectiveFee: 150,
      effectiveNet: receivable - 150,
      effectiveDiscrepancy: 0,
      codState: "remitted",
      orderVersion: 9,
    });
    expect(await db.codSettlementCorrection.count()).toBe(1);
    expect(await db.order.findUnique({ where: { id: order.id } })).toMatchObject({
      codState: "remitted",
      version: 9,
      codRemitted: true,
    });
  });

  it("replays exact commands without duplicating collection, settlement or money facts", async () => {
    const { order, receivable } = await seedDeliveredOrder(2);
    const collectionInput = {
      orderId: order.id,
      expectedVersion: 5,
      amount: receivable,
      provider: "manual-courier",
      reference: "COL-REPLAY",
      collectedAt: new Date("2026-07-30T10:00:00.000Z"),
      idempotencyKey: "cod-replay-collection",
    };
    const firstCollection = await recordCanonicalCodCollection(context, collectionInput);
    const replayCollection = await recordCanonicalCodCollection(context, collectionInput);
    expect(replayCollection).toEqual({ ...firstCollection, replayed: true });
    expect(await db.codCollection.count()).toBe(1);

    const settlementInput = {
      provider: "manual-courier",
      externalReference: "REM-REPLAY",
      receivedAt: new Date("2026-07-30T11:00:00.000Z"),
      idempotencyKey: "cod-replay-settlement",
      lines: [{
        orderId: order.id,
        expectedVersion: 6,
        grossRemittedAmount: receivable,
        feeAmount: 100,
        isFinal: true,
      }],
    };
    const firstSettlement = await postCanonicalCodSettlement(context, settlementInput);
    const replaySettlement = await postCanonicalCodSettlement(context, settlementInput);
    expect(replaySettlement).toEqual({ ...firstSettlement, replayed: true });
    expect(await db.codSettlement.count()).toBe(1);
    expect(await db.codSettlementLine.count()).toBe(1);

    const movements = await db.financialMovement.count({
      where: { orderId: order.id },
    });
    expect(movements).toBe(4);
  });

  it("allows only one concurrent collection to claim the order version", async () => {
    const { order, receivable } = await seedDeliveredOrder(2);
    const outcomes = await Promise.allSettled([
      collect({
        orderId: order.id,
        expectedVersion: 5,
        amount: receivable,
        key: "cod-collection-race-a",
      }),
      collect({
        orderId: order.id,
        expectedVersion: 5,
        amount: receivable,
        key: "cod-collection-race-b",
      }),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
    expect(await db.codCollection.count()).toBe(1);
    expect(await db.order.findUnique({ where: { id: order.id } })).toMatchObject({
      codState: "collected",
      version: 6,
    });
  });
});
