/**
 * Analytics v2 service (Phase 7).
 *
 * Adds: return-rate analytics (by wilaya/product/courier), period-over-period
 * comparison, SKU P&L, wilaya P&L, courier comparison. These are the
 * insights that make SahelFlow a real analytics tool, not just counts.
 */
import "server-only";
import { db } from "@/lib/db";
import { getProfitabilitySeries } from "@/lib/accounting/profitability";

export interface DateRange {
  from: Date;
  to: Date;
}

/** Get a date range for the last N days (ending now). */
export function getLastNDays(days: number): DateRange {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);
  return { from, to };
}

/** Get the previous period of the same length (for comparison). */
export function getPreviousPeriod(range: DateRange): DateRange {
  const diff = range.to.getTime() - range.from.getTime();
  const to = new Date(range.from);
  const from = new Date(to.getTime() - diff);
  return { from, to };
}

/** Return-rate analytics by wilaya (the killer COD metric). */
export async function getReturnRateByWilaya(range: DateRange) {
  const orders = await db.order.findMany({
    where: {
      createdAt: { gte: range.from, lt: range.to },
      deletedAt: null,
      status: { in: ["delivered", "returned", "refused"] },
    },
    select: { wilaya: true, status: true },
  });

  const byWilaya: Record<string, { total: number; returned: number }> = {};
  for (const order of orders) {
    if (!byWilaya[order.wilaya]) {
      byWilaya[order.wilaya] = { total: 0, returned: 0 };
    }
    byWilaya[order.wilaya]!.total++;
    if (order.status === "returned" || order.status === "refused") {
      byWilaya[order.wilaya]!.returned++;
    }
  }

  return Object.entries(byWilaya)
    .map(([wilaya, data]) => ({
      wilaya,
      total: data.total,
      returned: data.returned,
      returnRate: data.total > 0 ? (data.returned / data.total) * 100 : 0,
    }))
    .sort((a, b) => b.returnRate - a.returnRate);
}

/** Return-rate analytics by product. */
export async function getReturnRateByProduct(range: DateRange) {
  const items = await db.orderItem.findMany({
    where: {
      order: {
        createdAt: { gte: range.from, lt: range.to },
        deletedAt: null,
        status: { in: ["delivered", "returned", "refused"] },
      },
    },
    select: { productName: true, order: { select: { status: true } } },
  });

  const byProduct: Record<string, { total: number; returned: number }> = {};
  for (const item of items) {
    if (!byProduct[item.productName]) {
      byProduct[item.productName] = { total: 0, returned: 0 };
    }
    byProduct[item.productName]!.total++;
    if (item.order.status === "returned" || item.order.status === "refused") {
      byProduct[item.productName]!.returned++;
    }
  }

  return Object.entries(byProduct)
    .map(([product, data]) => ({
      product,
      total: data.total,
      returned: data.returned,
      returnRate: data.total > 0 ? (data.returned / data.total) * 100 : 0,
    }))
    .sort((a, b) => b.returnRate - a.returnRate)
    .slice(0, 20);
}

interface SkuPnlAccumulator {
  revenue: number;
  cost: number;
  quantity: number;
  missingCostItemCount: number;
  estimatedCostItemCount: number;
}

interface SkuAllocationItem {
  id: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  total: number;
  product: { cost: number | null } | null;
}

function allocateDzd(
  amount: number,
  items: readonly Array<{ id: string; quantity: number; unitPrice: number }>,
): Array<{ itemId: string; amount: number }> {
  if (amount <= 0 || items.length === 0) return [];
  const ordered = [...items].sort((a, b) => a.id.localeCompare(b.id));
  const weights = ordered.map((item) => ({
    item,
    weight: Math.max(0, item.unitPrice * item.quantity),
  }));
  const totalWeight = weights.reduce((sum, entry) => sum + entry.weight, 0);
  let allocated = 0;
  return weights.map((entry, index) => {
    const isLast = index === weights.length - 1;
    const share = isLast
      ? amount - allocated
      : totalWeight > 0
        ? Math.floor((amount * entry.weight) / totalWeight)
        : Math.floor(amount / weights.length);
    allocated += share;
    return { itemId: entry.item.id, amount: share };
  });
}

/**
 * SKU P&L — realized item revenue, immutable delivery-time COGS and exact
 * refund/reversal allocation. Shipping income/cost and operating expenses are
 * intentionally excluded because they are order/shop-level facts rather than
 * SKU facts.
 */
export async function getSkuPnl(range: DateRange) {
  const [
    recognizedSnapshots,
    returnMovements,
    canonicalRefunds,
    refundReversals,
    legacyRefunds,
    legacyOrders,
  ] = await Promise.all([
    db.profitabilityCostSnapshot.findMany({
      where: { recognizedAt: { gte: range.from, lt: range.to } },
      select: {
        orderId: true,
        orderItemId: true,
        quantity: true,
        unitCost: true,
        isExact: true,
      },
    }),
    db.inventoryMovement.findMany({
      where: {
        occurredAt: { gte: range.from, lt: range.to },
        movementType: {
          in: [
            "customer_return_inspected_available",
            "customer_return_inspected_quarantine",
            "return_inspected_available",
            "return_inspected_quarantine",
          ],
        },
        orderItemId: { not: null },
      },
      select: { orderItemId: true, quantity: true },
    }),
    db.canonicalRefund.findMany({
      where: { occurredAt: { gte: range.from, lt: range.to } },
      select: { orderId: true, returnId: true, amount: true },
    }),
    db.canonicalRefundReversal.findMany({
      where: { occurredAt: { gte: range.from, lt: range.to } },
      select: {
        amount: true,
        refund: { select: { orderId: true, returnId: true } },
      },
    }),
    db.refund.findMany({
      where: {
        createdAt: { gte: range.from, lt: range.to },
        status: "completed",
        reversed: false,
      },
      select: { orderId: true, amount: true },
    }),
    db.order.findMany({
      where: {
        deliveredAt: { gte: range.from, lt: range.to },
        status: "delivered",
        deletedAt: null,
      },
      select: {
        id: true,
        items: {
          select: {
            id: true,
            productName: true,
            quantity: true,
            unitPrice: true,
            total: true,
            product: { select: { cost: true } },
          },
        },
      },
    }),
  ]);

  const returnIds = new Set<string>();
  const refundOrderIds = new Set<string>();
  for (const refund of canonicalRefunds) {
    refundOrderIds.add(refund.orderId);
    if (refund.returnId) returnIds.add(refund.returnId);
  }
  for (const reversal of refundReversals) {
    refundOrderIds.add(reversal.refund.orderId);
    if (reversal.refund.returnId) returnIds.add(reversal.refund.returnId);
  }
  for (const refund of legacyRefunds) refundOrderIds.add(refund.orderId);

  const returnItems = returnIds.size
    ? await db.canonicalReturnItem.findMany({
        where: { returnId: { in: [...returnIds] } },
        select: { returnId: true, orderItemId: true, quantity: true },
      })
    : [];

  const relevantItemIds = new Set<string>(
    recognizedSnapshots.map((snapshot) => snapshot.orderItemId),
  );
  for (const movement of returnMovements) {
    if (movement.orderItemId) relevantItemIds.add(movement.orderItemId);
  }
  for (const item of returnItems) relevantItemIds.add(item.orderItemId);

  const refundItems = refundOrderIds.size
    ? await db.orderItem.findMany({
        where: {
          OR: [
            { id: { in: [...relevantItemIds] } },
            { orderId: { in: [...refundOrderIds] } },
          ],
        },
        select: {
          id: true,
          orderId: true,
          productName: true,
          quantity: true,
          unitPrice: true,
          total: true,
          product: { select: { cost: true } },
        },
      })
    : relevantItemIds.size
      ? await db.orderItem.findMany({
          where: { id: { in: [...relevantItemIds] } },
          select: {
            id: true,
            orderId: true,
            productName: true,
            quantity: true,
            unitPrice: true,
            total: true,
            product: { select: { cost: true } },
          },
        })
      : [];

  const itemsById = new Map(refundItems.map((item) => [item.id, item]));
  const itemsByOrder = new Map<string, typeof refundItems>();
  for (const item of refundItems) {
    const items = itemsByOrder.get(item.orderId) ?? [];
    items.push(item);
    itemsByOrder.set(item.orderId, items);
  }
  const returnItemsByReturn = new Map<string, typeof returnItems>();
  for (const item of returnItems) {
    const items = returnItemsByReturn.get(item.returnId) ?? [];
    items.push(item);
    returnItemsByReturn.set(item.returnId, items);
  }
  const snapshotsByItem = new Map(
    recognizedSnapshots.map((snapshot) => [snapshot.orderItemId, snapshot]),
  );
  const returnItemIds = returnMovements
    .map((movement) => movement.orderItemId)
    .filter((value): value is string => Boolean(value));
  if (returnItemIds.length > 0) {
    const returnSnapshots = await db.profitabilityCostSnapshot.findMany({
      where: { orderItemId: { in: returnItemIds } },
      select: {
        orderId: true,
        orderItemId: true,
        quantity: true,
        unitCost: true,
        isExact: true,
      },
    });
    for (const snapshot of returnSnapshots) {
      snapshotsByItem.set(snapshot.orderItemId, snapshot);
    }
  }

  const bySku = new Map<string, SkuPnlAccumulator>();
  const accumulatorFor = (item: SkuAllocationItem): SkuPnlAccumulator => {
    const existing = bySku.get(item.productName);
    if (existing) return existing;
    const created: SkuPnlAccumulator = {
      revenue: 0,
      cost: 0,
      quantity: 0,
      missingCostItemCount: 0,
      estimatedCostItemCount: 0,
    };
    bySku.set(item.productName, created);
    return created;
  };
  const applyCost = (
    item: SkuAllocationItem,
    quantity: number,
    direction: 1 | -1,
  ) => {
    const accumulator = accumulatorFor(item);
    const snapshot = snapshotsByItem.get(item.id);
    const unitCost = snapshot?.unitCost ?? item.product?.cost ?? null;
    if (unitCost === null) accumulator.missingCostItemCount += quantity;
    else accumulator.cost += direction * unitCost * quantity;
    if (!snapshot?.isExact && unitCost !== null) {
      accumulator.estimatedCostItemCount += quantity;
    }
  };

  const canonicalOrderIds = new Set(
    recognizedSnapshots.map((snapshot) => snapshot.orderId),
  );
  for (const snapshot of recognizedSnapshots) {
    const item = itemsById.get(snapshot.orderItemId);
    if (!item) continue;
    const accumulator = accumulatorFor(item);
    accumulator.revenue += item.total;
    accumulator.quantity += snapshot.quantity;
    applyCost(item, snapshot.quantity, 1);
  }
  for (const order of legacyOrders) {
    if (canonicalOrderIds.has(order.id)) continue;
    for (const item of order.items) {
      const accumulator = accumulatorFor(item);
      accumulator.revenue += item.total;
      accumulator.quantity += item.quantity;
      applyCost(item, item.quantity, 1);
    }
  }
  for (const movement of returnMovements) {
    if (!movement.orderItemId) continue;
    const item = itemsById.get(movement.orderItemId);
    if (!item) continue;
    const accumulator = accumulatorFor(item);
    accumulator.quantity -= movement.quantity;
    applyCost(item, movement.quantity, -1);
  }

  const allocateRefund = (
    orderId: string,
    returnId: string | null,
    amount: number,
    direction: 1 | -1,
  ) => {
    const returned = returnId ? returnItemsByReturn.get(returnId) ?? [] : [];
    const candidates = returned.length
      ? returned
          .map((returnedItem) => {
            const item = itemsById.get(returnedItem.orderItemId);
            return item
              ? {
                  id: item.id,
                  quantity: returnedItem.quantity,
                  unitPrice: item.unitPrice,
                }
              : null;
          })
          .filter(
            (
              item,
            ): item is { id: string; quantity: number; unitPrice: number } =>
              Boolean(item),
          )
      : (itemsByOrder.get(orderId) ?? []).map((item) => ({
          id: item.id,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        }));
    for (const allocation of allocateDzd(amount, candidates)) {
      const item = itemsById.get(allocation.itemId);
      if (!item) continue;
      accumulatorFor(item).revenue += direction * allocation.amount;
    }
  };

  for (const refund of canonicalRefunds) {
    allocateRefund(refund.orderId, refund.returnId, refund.amount, -1);
  }
  for (const reversal of refundReversals) {
    allocateRefund(
      reversal.refund.orderId,
      reversal.refund.returnId,
      reversal.amount,
      1,
    );
  }
  const canonicalRefundOrderIds = new Set(
    canonicalRefunds.map((refund) => refund.orderId),
  );
  for (const refund of legacyRefunds) {
    if (!canonicalRefundOrderIds.has(refund.orderId)) {
      allocateRefund(refund.orderId, null, refund.amount, -1);
    }
  }

  return [...bySku.entries()]
    .map(([sku, data]) => ({
      sku,
      revenue: data.revenue,
      cost: data.cost,
      margin: data.revenue - data.cost,
      marginPct:
        data.revenue > 0
          ? ((data.revenue - data.cost) / data.revenue) * 100
          : 0,
      quantity: data.quantity,
      missingCostItemCount: data.missingCostItemCount,
      estimatedCostItemCount: data.estimatedCostItemCount,
      profitabilityComplete:
        data.missingCostItemCount === 0 && data.estimatedCostItemCount === 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

/** Period-over-period comparison using realized delivery revenue. */
export async function getPeriodComparison(
  current: DateRange,
  previous: DateRange,
) {
  const [currentOrders, previousOrders, profitability] = await Promise.all([
    db.order.findMany({
      where: {
        createdAt: { gte: current.from, lt: current.to },
        deletedAt: null,
      },
      select: { status: true },
    }),
    db.order.findMany({
      where: {
        createdAt: { gte: previous.from, lt: previous.to },
        deletedAt: null,
      },
      select: { status: true },
    }),
    getProfitabilitySeries(db, [
      { key: "current", period: current },
      { key: "previous", period: previous },
    ]),
  ]);
  const projections = new Map(
    profitability.map((entry) => [entry.key, entry.projection]),
  );
  const currentProfitability = projections.get("current");
  const previousProfitability = projections.get("previous");
  if (!currentProfitability || !previousProfitability) {
    throw new Error("Profitability comparison periods were not projected");
  }

  const currentDelivered = currentOrders.filter(
    (order) => order.status === "delivered",
  ).length;
  const previousDelivered = previousOrders.filter(
    (order) => order.status === "delivered",
  ).length;
  const currentReturned = currentOrders.filter(
    (order) => order.status === "returned" || order.status === "refused",
  ).length;
  const previousReturned = previousOrders.filter(
    (order) => order.status === "returned" || order.status === "refused",
  ).length;
  const currentReturnRate =
    currentDelivered + currentReturned > 0
      ? (currentReturned / (currentDelivered + currentReturned)) * 100
      : 0;
  const previousReturnRate =
    previousDelivered + previousReturned > 0
      ? (previousReturned / (previousDelivered + previousReturned)) * 100
      : 0;
  const pctChange = (value: number, baseline: number) =>
    baseline === 0 ? (value > 0 ? 100 : 0) : ((value - baseline) / baseline) * 100;

  return {
    current: {
      orders: currentOrders.length,
      revenue: currentProfitability.grossRevenue,
      delivered: currentDelivered,
      returned: currentReturned,
      returnRate: currentReturnRate,
    },
    previous: {
      orders: previousOrders.length,
      revenue: previousProfitability.grossRevenue,
      delivered: previousDelivered,
      returned: previousReturned,
      returnRate: previousReturnRate,
    },
    changes: {
      orders: pctChange(currentOrders.length, previousOrders.length),
      revenue: pctChange(
        currentProfitability.grossRevenue,
        previousProfitability.grossRevenue,
      ),
      delivered: pctChange(currentDelivered, previousDelivered),
      returnRate: pctChange(currentReturnRate, previousReturnRate),
    },
  };
}
