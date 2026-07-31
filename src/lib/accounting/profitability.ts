import "server-only";

import type { DbClient } from "@/lib/db";
import { ValidationError } from "@/types/errors";

export interface ProfitabilityPeriod {
  from: Date;
  to: Date;
}

export interface ProfitabilityProjection {
  period: ProfitabilityPeriod;
  grossRevenue: number;
  refunds: number;
  netRevenue: number;
  cogs: number;
  grossProfit: number;
  courierFees: number;
  settlementAdjustments: number;
  inventoryLosses: number;
  recordedInventoryLosses: number;
  operatingExpenses: number;
  contributionProfit: number;
  netProfit: number;
  settlementDiscrepancy: number;
  missingCostItemCount: number;
  estimatedCostItemCount: number;
  costIntegrityIssueCount: number;
  profitabilityComplete: boolean;
}

export interface ProfitabilitySeriesPeriod {
  key: string;
  period: ProfitabilityPeriod;
}

interface ProfitabilityMovementRow {
  orderId: string | null;
  movementType: string;
  amount: number;
  occurredAt: Date;
}

interface ExpenseRow {
  amount: number;
  date: Date;
}

interface CostSnapshotRow {
  orderId: string;
  orderItemId: string;
  quantity: number;
  unitCost: number | null;
  costBasis: string;
  isExact: boolean;
  recognizedAt: Date;
}

interface InventoryMovementRow {
  orderId: string | null;
  orderItemId: string | null;
  movementType: string;
  quantity: number;
  occurredAt: Date;
}

interface CostItemRow {
  id: string;
  orderId: string;
  quantity: number;
  product: { cost: number | null } | null;
}

interface CostAuthorityOrderRow {
  id: string;
  deliveredAt: Date | null;
  items: CostItemRow[];
}

interface LegacyDeliveredOrderRow extends CostAuthorityOrderRow {
  totalPrice: number;
  delivery: { cost: number | null } | null;
}

interface LegacyRefundRow {
  orderId: string;
  amount: number;
  createdAt: Date;
}

interface ProfitabilityFacts {
  movements: ProfitabilityMovementRow[];
  expenses: ExpenseRow[];
  snapshots: CostSnapshotRow[];
  inventoryMovements: InventoryMovementRow[];
  authorityOrders: CostAuthorityOrderRow[];
  legacyOrders: LegacyDeliveredOrderRow[];
  legacyRefunds: LegacyRefundRow[];
}

interface ResolvedCost {
  unitCost: number | null;
  exact: boolean;
  quantity: number;
}

const REVENUE_MOVEMENT = "cod_receivable_created";
const REFUND_MOVEMENTS = new Set([
  "customer_refund_issued",
  "customer_refund_via_courier_deduction",
  "customer_refund_reversed",
]);
const COURIER_FEE_MOVEMENTS = new Set([
  "courier_fee_withheld",
  "courier_fee_correction",
]);
const SETTLEMENT_ADJUSTMENT_MOVEMENTS = new Set([
  "cod_settlement_adjustment",
  "cod_settlement_adjustment_correction",
]);
const SETTLEMENT_DISCREPANCY_MOVEMENTS = new Set([
  "cod_collection_discrepancy_recorded",
  "cod_collection_correction",
  "cod_settlement_discrepancy_recorded",
  "cod_settlement_discrepancy_correction",
]);
const INVENTORY_LOSS_MOVEMENTS = new Set([
  "customer_return_damaged_loss",
  "customer_return_lost_loss",
  "returned_inventory_damaged_loss",
  "returned_inventory_lost_loss",
]);
const RETURN_ASSET_MOVEMENTS = new Set([
  "customer_return_inspected_available",
  "customer_return_inspected_quarantine",
  "return_inspected_available",
  "return_inspected_quarantine",
]);

export const PROFITABILITY_FINANCIAL_MOVEMENT_TYPES = [
  REVENUE_MOVEMENT,
  ...REFUND_MOVEMENTS,
  ...COURIER_FEE_MOVEMENTS,
  ...SETTLEMENT_ADJUSTMENT_MOVEMENTS,
  ...SETTLEMENT_DISCREPANCY_MOVEMENTS,
  ...INVENTORY_LOSS_MOVEMENTS,
] as const;

export const PROFITABILITY_INVENTORY_MOVEMENT_TYPES = [
  ...RETURN_ASSET_MOVEMENTS,
] as const;

function assertPeriod(period: ProfitabilityPeriod): void {
  if (
    Number.isNaN(period.from.getTime()) ||
    Number.isNaN(period.to.getTime()) ||
    period.from >= period.to
  ) {
    throw new ValidationError(
      "Profitability period must be a valid half-open interval [from, to)",
      "period",
    );
  }
}

function inPeriod(date: Date, period: ProfitabilityPeriod): boolean {
  return date >= period.from && date < period.to;
}

function sumMovementTypes(
  rows: readonly ProfitabilityMovementRow[],
  types: ReadonlySet<string>,
): number {
  return rows.reduce(
    (sum, movement) =>
      types.has(movement.movementType) ? sum + movement.amount : sum,
    0,
  );
}

function resolveCost(
  item: CostItemRow,
  snapshot: CostSnapshotRow | undefined,
): ResolvedCost {
  if (snapshot) {
    return {
      unitCost: snapshot.unitCost,
      exact: snapshot.isExact,
      quantity: snapshot.quantity,
    };
  }
  return {
    unitCost: item.product?.cost ?? null,
    exact: false,
    quantity: item.quantity,
  };
}

function recordCostQuality(
  resolved: ResolvedCost,
  quantity: number,
  counters: {
    missing: number;
    estimated: number;
    integrity: number;
  },
): void {
  if (resolved.quantity <= 0 || quantity <= 0 || quantity > resolved.quantity) {
    counters.integrity += quantity > 0 ? quantity : 1;
    return;
  }
  if (resolved.unitCost === null) {
    counters.missing += quantity;
  } else if (!resolved.exact) {
    counters.estimated += quantity;
  }
}

function safeCostAmount(unitCost: number | null, quantity: number): number {
  if (unitCost === null) return 0;
  const amount = unitCost * quantity;
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new ValidationError(
      "Profitability cost exceeds the supported DZD integer range",
      "profitability.cogs",
    );
  }
  return amount;
}

function summarizePeriod(
  facts: ProfitabilityFacts,
  period: ProfitabilityPeriod,
): ProfitabilityProjection {
  const movements = facts.movements.filter((row) =>
    inPeriod(row.occurredAt, period),
  );
  const inventoryMovements = facts.inventoryMovements.filter((row) =>
    inPeriod(row.occurredAt, period),
  );
  const snapshotsByItem = new Map(
    facts.snapshots.map((snapshot) => [snapshot.orderItemId, snapshot]),
  );
  const authorityOrdersById = new Map(
    facts.authorityOrders.map((order) => [order.id, order]),
  );
  const authorityItemsById = new Map(
    facts.authorityOrders.flatMap((order) =>
      order.items.map((item) => [item.id, item] as const),
    ),
  );

  const canonicalRevenueOrderIds = new Set(
    movements
      .filter((row) => row.movementType === REVENUE_MOVEMENT && row.orderId)
      .map((row) => row.orderId as string),
  );
  const canonicalGrossRevenue = movements.reduce(
    (sum, movement) =>
      movement.movementType === REVENUE_MOVEMENT
        ? sum + movement.amount
        : sum,
    0,
  );
  const legacyOrders = facts.legacyOrders.filter(
    (order) =>
      order.deliveredAt !== null &&
      inPeriod(order.deliveredAt, period) &&
      !canonicalRevenueOrderIds.has(order.id),
  );
  const legacyGrossRevenue = legacyOrders.reduce(
    (sum, order) => sum + order.totalPrice,
    0,
  );

  const canonicalRefundOrderIds = new Set(
    movements
      .filter((row) => REFUND_MOVEMENTS.has(row.movementType) && row.orderId)
      .map((row) => row.orderId as string),
  );
  const refundDelta = sumMovementTypes(movements, REFUND_MOVEMENTS);
  const legacyRefunds = facts.legacyRefunds
    .filter(
      (refund) =>
        inPeriod(refund.createdAt, period) &&
        !canonicalRefundOrderIds.has(refund.orderId),
    )
    .reduce((sum, refund) => sum + refund.amount, 0);

  const costQuality = { missing: 0, estimated: 0, integrity: 0 };
  let deliveryCogs = 0;
  for (const orderId of canonicalRevenueOrderIds) {
    const order = authorityOrdersById.get(orderId);
    if (!order || order.items.length === 0) {
      costQuality.integrity += 1;
      continue;
    }
    for (const item of order.items) {
      const resolved = resolveCost(item, snapshotsByItem.get(item.id));
      recordCostQuality(resolved, item.quantity, costQuality);
      deliveryCogs += safeCostAmount(resolved.unitCost, item.quantity);
    }
  }

  for (const order of legacyOrders) {
    for (const item of order.items) {
      const resolved = resolveCost(item, snapshotsByItem.get(item.id));
      recordCostQuality(resolved, item.quantity, costQuality);
      deliveryCogs += safeCostAmount(resolved.unitCost, item.quantity);
    }
  }

  let returnCogsReversal = 0;
  for (const movement of inventoryMovements) {
    if (
      !RETURN_ASSET_MOVEMENTS.has(movement.movementType) ||
      !movement.orderItemId
    ) {
      continue;
    }
    const item = authorityItemsById.get(movement.orderItemId);
    if (!item) {
      costQuality.integrity += movement.quantity;
      continue;
    }
    const resolved = resolveCost(item, snapshotsByItem.get(item.id));
    recordCostQuality(resolved, movement.quantity, costQuality);
    returnCogsReversal += safeCostAmount(
      resolved.unitCost,
      movement.quantity,
    );
  }

  const canonicalCourierFeeOrderIds = new Set(
    movements
      .filter(
        (row) => COURIER_FEE_MOVEMENTS.has(row.movementType) && row.orderId,
      )
      .map((row) => row.orderId as string),
  );
  const canonicalCourierFeesSigned = sumMovementTypes(
    movements,
    COURIER_FEE_MOVEMENTS,
  );
  const legacyCourierFees = legacyOrders.reduce(
    (sum, order) =>
      canonicalCourierFeeOrderIds.has(order.id)
        ? sum
        : sum + (order.delivery?.cost ?? 0),
    0,
  );

  const settlementAdjustments = sumMovementTypes(
    movements,
    SETTLEMENT_ADJUSTMENT_MOVEMENTS,
  );
  const settlementDiscrepancy = sumMovementTypes(
    movements,
    SETTLEMENT_DISCREPANCY_MOVEMENTS,
  );
  const lossRows = movements.filter((movement) =>
    INVENTORY_LOSS_MOVEMENTS.has(movement.movementType),
  );
  const recordedInventoryLosses = -lossRows.reduce(
    (sum, movement) => sum + movement.amount,
    0,
  );
  const recognizedCogsOrderIds = new Set([
    ...facts.snapshots.map((snapshot) => snapshot.orderId),
    ...facts.authorityOrders
      .filter((order) => order.deliveredAt !== null)
      .map((order) => order.id),
    ...legacyOrders.map((order) => order.id),
  ]);
  const inventoryLosses = -lossRows.reduce(
    (sum, movement) =>
      movement.orderId && recognizedCogsOrderIds.has(movement.orderId)
        ? sum
        : sum + movement.amount,
    0,
  );
  const operatingExpenses = facts.expenses
    .filter((expense) => inPeriod(expense.date, period))
    .reduce((sum, expense) => sum + expense.amount, 0);

  const grossRevenue = canonicalGrossRevenue + legacyGrossRevenue;
  const refunds = legacyRefunds - refundDelta;
  const netRevenue = grossRevenue + refundDelta - legacyRefunds;
  const cogs = deliveryCogs - returnCogsReversal;
  const courierFees = -canonicalCourierFeesSigned + legacyCourierFees;
  const grossProfit = netRevenue - cogs;
  const contributionProfit =
    grossProfit - courierFees + settlementAdjustments - inventoryLosses;
  const netProfit = contributionProfit - operatingExpenses;

  return {
    period,
    grossRevenue,
    refunds,
    netRevenue,
    cogs,
    grossProfit,
    courierFees,
    settlementAdjustments,
    inventoryLosses,
    recordedInventoryLosses,
    operatingExpenses,
    contributionProfit,
    netProfit,
    settlementDiscrepancy,
    missingCostItemCount: costQuality.missing,
    estimatedCostItemCount: costQuality.estimated,
    costIntegrityIssueCount: costQuality.integrity,
    profitabilityComplete:
      costQuality.missing === 0 &&
      costQuality.estimated === 0 &&
      costQuality.integrity === 0,
  };
}

async function loadProfitabilityFacts(
  db: DbClient,
  period: ProfitabilityPeriod,
): Promise<ProfitabilityFacts> {
  const [movements, expenses, inventoryMovements, legacyOrders, legacyRefunds] =
    await Promise.all([
      db.financialMovement.findMany({
        where: {
          currency: "DZD",
          occurredAt: { gte: period.from, lt: period.to },
          movementType: { in: [...PROFITABILITY_FINANCIAL_MOVEMENT_TYPES] },
        },
        select: {
          orderId: true,
          movementType: true,
          amount: true,
          occurredAt: true,
        },
      }),
      db.expense.findMany({
        where: {
          date: { gte: period.from, lt: period.to },
          deletedAt: null,
        },
        select: { amount: true, date: true },
      }),
      db.inventoryMovement.findMany({
        where: {
          occurredAt: { gte: period.from, lt: period.to },
          movementType: { in: [...PROFITABILITY_INVENTORY_MOVEMENT_TYPES] },
        },
        select: {
          orderId: true,
          orderItemId: true,
          movementType: true,
          quantity: true,
          occurredAt: true,
        },
      }),
      db.order.findMany({
        where: {
          deliveredAt: { gte: period.from, lt: period.to },
          status: { in: ["delivered", "returned"] },
          deletedAt: null,
        },
        select: {
          id: true,
          totalPrice: true,
          deliveredAt: true,
          items: {
            select: {
              id: true,
              orderId: true,
              quantity: true,
              product: { select: { cost: true } },
            },
          },
          delivery: { select: { cost: true } },
        },
      }),
      db.refund.findMany({
        where: {
          createdAt: { gte: period.from, lt: period.to },
          status: "completed",
          reversed: false,
        },
        select: { orderId: true, amount: true, createdAt: true },
      }),
    ]);

  const authorityOrderIds = new Set<string>();
  for (const movement of movements) {
    if (movement.orderId) authorityOrderIds.add(movement.orderId);
  }
  for (const movement of inventoryMovements) {
    if (movement.orderId) authorityOrderIds.add(movement.orderId);
  }
  const returnItemIds = inventoryMovements
    .map((movement) => movement.orderItemId)
    .filter((value): value is string => Boolean(value));

  const [snapshots, authorityOrders] = await Promise.all([
    db.profitabilityCostSnapshot.findMany({
      where: {
        OR: [
          { recognizedAt: { gte: period.from, lt: period.to } },
          { orderItemId: { in: returnItemIds } },
        ],
      },
      select: {
        orderId: true,
        orderItemId: true,
        quantity: true,
        unitCost: true,
        costBasis: true,
        isExact: true,
        recognizedAt: true,
      },
    }),
    authorityOrderIds.size > 0
      ? db.order.findMany({
          where: { id: { in: [...authorityOrderIds] }, deletedAt: null },
          select: {
            id: true,
            deliveredAt: true,
            items: {
              select: {
                id: true,
                orderId: true,
                quantity: true,
                product: { select: { cost: true } },
              },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  return {
    movements,
    expenses,
    snapshots,
    inventoryMovements,
    authorityOrders,
    legacyOrders,
    legacyRefunds,
  };
}

export async function getProfitabilityProjection(
  db: DbClient,
  period: ProfitabilityPeriod,
): Promise<ProfitabilityProjection> {
  assertPeriod(period);
  const facts = await loadProfitabilityFacts(db, period);
  return summarizePeriod(facts, period);
}

export async function getProfitabilitySeries(
  db: DbClient,
  periods: readonly ProfitabilitySeriesPeriod[],
): Promise<Array<{ key: string; projection: ProfitabilityProjection }>> {
  if (periods.length === 0) return [];
  for (const entry of periods) assertPeriod(entry.period);
  const unionPeriod = {
    from: new Date(
      Math.min(...periods.map((entry) => entry.period.from.getTime())),
    ),
    to: new Date(
      Math.max(...periods.map((entry) => entry.period.to.getTime())),
    ),
  };
  const facts = await loadProfitabilityFacts(db, unionPeriod);
  return periods.map((entry) => ({
    key: entry.key,
    projection: summarizePeriod(facts, entry.period),
  }));
}
