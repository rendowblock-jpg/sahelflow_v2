import { describe, expect, it } from "vitest";

import { getProfitabilityProjection } from "@/lib/accounting/profitability";

interface FakeInput {
  movements?: Array<{
    orderId: string | null;
    movementType: string;
    amount: number;
    occurredAt: Date;
  }>;
  expenses?: Array<{ amount: number; date: Date }>;
  snapshots?: Array<{
    orderId: string;
    orderItemId: string;
    quantity: number;
    unitCost: number | null;
    costBasis: string;
    isExact: boolean;
    recognizedAt: Date;
  }>;
  inventoryMovements?: Array<{
    orderId: string | null;
    orderItemId: string | null;
    movementType: string;
    quantity: number;
    occurredAt: Date;
  }>;
  authorityOrders?: Array<{
    id: string;
    deliveredAt: Date | null;
    items: Array<{
      id: string;
      orderId: string;
      quantity: number;
      product: { cost: number | null } | null;
    }>;
  }>;
  legacyOrders?: Array<{
    id: string;
    totalPrice: number;
    deliveredAt: Date | null;
    items: Array<{
      id: string;
      orderId: string;
      quantity: number;
      product: { cost: number | null } | null;
    }>;
    delivery: { cost: number | null } | null;
  }>;
  legacyRefunds?: Array<{ orderId: string; amount: number; createdAt: Date }>;
}

function fakeDb(input: FakeInput) {
  let orderRead = 0;
  return {
    financialMovement: {
      findMany: async () => input.movements ?? [],
    },
    expense: {
      findMany: async () => input.expenses ?? [],
    },
    inventoryMovement: {
      findMany: async () => input.inventoryMovements ?? [],
    },
    profitabilityCostSnapshot: {
      findMany: async () => input.snapshots ?? [],
    },
    order: {
      findMany: async () => {
        orderRead += 1;
        return orderRead === 1
          ? (input.legacyOrders ?? [])
          : (input.authorityOrders ?? []);
      },
    },
    refund: {
      findMany: async () => input.legacyRefunds ?? [],
    },
  };
}

const from = new Date("2026-07-01T00:00:00.000Z");
const to = new Date("2026-08-01T00:00:00.000Z");
const occurredAt = new Date("2026-07-15T12:00:00.000Z");

function authorityOrder(cost: number | null = 2_000) {
  return {
    id: "order-1",
    deliveredAt: occurredAt,
    items: [
      {
        id: "item-1",
        orderId: "order-1",
        quantity: 2,
        product: { cost },
      },
    ],
  };
}

describe("governed profitability projection", () => {
  it("uses earned revenue and immutable COGS without counting COD cash transfers twice", async () => {
    const projection = await getProfitabilityProjection(
      fakeDb({
        movements: [
          { orderId: "order-1", movementType: "cod_receivable_created", amount: 10_000, occurredAt },
          { orderId: "order-1", movementType: "cod_cash_collected_by_courier", amount: 10_000, occurredAt },
          { orderId: "order-1", movementType: "cod_remittance_gross_received", amount: 9_500, occurredAt },
          { orderId: "order-1", movementType: "customer_refund_issued", amount: -1_000, occurredAt },
          { orderId: "order-1", movementType: "customer_refund_reversed", amount: 200, occurredAt },
          { orderId: "order-1", movementType: "courier_fee_withheld", amount: -500, occurredAt },
          { orderId: "order-1", movementType: "cod_settlement_adjustment", amount: -100, occurredAt },
          { orderId: "order-1", movementType: "customer_return_damaged_loss", amount: -300, occurredAt },
          { orderId: "order-1", movementType: "cod_settlement_discrepancy_recorded", amount: -50, occurredAt },
        ],
        snapshots: [
          {
            orderId: "order-1",
            orderItemId: "item-1",
            quantity: 2,
            unitCost: 2_000,
            costBasis: "delivery_catalog_cost_v1",
            isExact: true,
            recognizedAt: occurredAt,
          },
        ],
        inventoryMovements: [
          {
            orderId: "order-1",
            orderItemId: "item-1",
            movementType: "customer_return_inspected_available",
            quantity: 1,
            occurredAt,
          },
        ],
        authorityOrders: [authorityOrder()],
        expenses: [{ amount: 600, date: occurredAt }],
      }) as never,
      { from, to },
    );

    expect(projection).toMatchObject({
      grossRevenue: 10_000,
      refunds: 800,
      netRevenue: 9_200,
      cogs: 2_000,
      grossProfit: 7_200,
      courierFees: 500,
      settlementAdjustments: -100,
      inventoryLosses: 0,
      recordedInventoryLosses: 300,
      operatingExpenses: 600,
      contributionProfit: 6_600,
      netProfit: 6_000,
      settlementDiscrepancy: -50,
      missingCostItemCount: 0,
      estimatedCostItemCount: 0,
      costIntegrityIssueCount: 0,
      profitabilityComplete: true,
    });
  });

  it("keeps historical delivered orders readable but marks mutable-cost fallback as estimated", async () => {
    const projection = await getProfitabilityProjection(
      fakeDb({
        legacyOrders: [
          {
            id: "legacy-order",
            totalPrice: 5_000,
            deliveredAt: occurredAt,
            items: [
              {
                id: "legacy-item",
                orderId: "legacy-order",
                quantity: 2,
                product: { cost: 1_000 },
              },
            ],
            delivery: { cost: 400 },
          },
        ],
        legacyRefunds: [
          { orderId: "legacy-order", amount: 500, createdAt: occurredAt },
        ],
        expenses: [{ amount: 100, date: occurredAt }],
      }) as never,
      { from, to },
    );

    expect(projection).toMatchObject({
      grossRevenue: 5_000,
      refunds: 500,
      netRevenue: 4_500,
      cogs: 2_000,
      courierFees: 400,
      operatingExpenses: 100,
      netProfit: 2_000,
      estimatedCostItemCount: 2,
      profitabilityComplete: false,
    });
  });

  it("does not silently treat missing catalog cost as zero-quality profitability", async () => {
    const projection = await getProfitabilityProjection(
      fakeDb({
        movements: [
          { orderId: "order-1", movementType: "cod_receivable_created", amount: 5_000, occurredAt },
        ],
        snapshots: [
          {
            orderId: "order-1",
            orderItemId: "item-1",
            quantity: 2,
            unitCost: null,
            costBasis: "delivery_missing_catalog_cost_v1",
            isExact: false,
            recognizedAt: occurredAt,
          },
        ],
        authorityOrders: [authorityOrder(null)],
      }) as never,
      { from, to },
    );

    expect(projection).toMatchObject({
      grossRevenue: 5_000,
      cogs: 0,
      missingCostItemCount: 2,
      profitabilityComplete: false,
    });
  });

  it("uses half-open period boundaries", async () => {
    const projection = await getProfitabilityProjection(
      fakeDb({
        movements: [
          { orderId: "included", movementType: "cod_receivable_created", amount: 1_000, occurredAt: from },
          { orderId: "excluded", movementType: "cod_receivable_created", amount: 9_000, occurredAt: to },
        ],
        authorityOrders: [],
      }) as never,
      { from, to },
    );

    expect(projection.grossRevenue).toBe(1_000);
    expect(projection.costIntegrityIssueCount).toBe(1);
  });
});
