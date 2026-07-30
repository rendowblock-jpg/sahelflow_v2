import "server-only";

import type { BusinessPrincipalContext } from "@/lib/business-truth/principal";
import { isTrustedManualOrderAuthority } from "@/lib/orders/manual-order-authority";
import { NotFoundError } from "@/types/errors";

export interface CanonicalCodOrderPosition {
  orderId: string;
  orderNumber: string;
  orderVersion: number;
  customerName: string;
  provider: string | null;
  codState: string | null;
  expectedReceivable: number;
  effectiveCollected: number;
  grossRemitted: number;
  fees: number;
  adjustments: number;
  netReceived: number;
  discrepancy: number;
  outstandingCollection: number;
  outstandingRemittance: number;
  collectionReference: string | null;
  collectedAt: string | null;
  lastSettlementReference: string | null;
  lastSettlementAt: string | null;
}

export interface CanonicalCodSettlementSummary {
  settlementId: string;
  provider: string;
  externalReference: string;
  status: string;
  receivedAt: string;
  grossAmount: number;
  feeAmount: number;
  adjustmentAmount: number;
  netAmount: number;
  discrepancyAmount: number;
  unmatchedAmount: number;
  lineCount: number;
}

export interface CanonicalCodWorkspaceSummary {
  totals: {
    expectedReceivable: number;
    effectiveCollected: number;
    grossRemitted: number;
    fees: number;
    adjustments: number;
    netReceived: number;
    discrepancy: number;
    unmatched: number;
    outstandingCollection: number;
    outstandingRemittance: number;
  };
  counts: {
    receivable: number;
    awaitingCollection: number;
    awaitingRemittance: number;
    disputed: number;
    remitted: number;
    settlementsNeedingReview: number;
  };
  awaitingCollection: CanonicalCodOrderPosition[];
  awaitingRemittance: CanonicalCodOrderPosition[];
  disputed: CanonicalCodOrderPosition[];
  recentSettlements: CanonicalCodSettlementSummary[];
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function collectionAmount(collection: {
  amount: number;
  corrections: Array<{ amountDelta: number }>;
} | null): number {
  if (!collection) return 0;
  return collection.amount + sum(collection.corrections.map((entry) => entry.amountDelta));
}

function lineAmounts(lines: Array<{
  grossRemittedAmount: number;
  feeAmount: number;
  adjustmentAmount: number;
  discrepancyAmount: number;
  corrections: Array<{
    grossDelta: number;
    feeDelta: number;
    adjustmentDelta: number;
    discrepancyDelta: number;
  }>;
  settlement: { externalReference: string; receivedAt: Date };
}>): {
  gross: number;
  fees: number;
  adjustments: number;
  net: number;
  discrepancy: number;
  lastReference: string | null;
  lastAt: string | null;
} {
  let gross = 0;
  let fees = 0;
  let adjustments = 0;
  let discrepancy = 0;
  let latest: { externalReference: string; receivedAt: Date } | null = null;
  for (const line of lines) {
    gross += line.grossRemittedAmount + sum(line.corrections.map((entry) => entry.grossDelta));
    fees += line.feeAmount + sum(line.corrections.map((entry) => entry.feeDelta));
    adjustments +=
      line.adjustmentAmount +
      sum(line.corrections.map((entry) => entry.adjustmentDelta));
    discrepancy +=
      line.discrepancyAmount +
      sum(line.corrections.map((entry) => entry.discrepancyDelta));
    if (!latest || line.settlement.receivedAt > latest.receivedAt) {
      latest = line.settlement;
    }
  }
  return {
    gross,
    fees,
    adjustments,
    net: gross - fees + adjustments,
    discrepancy,
    lastReference: latest?.externalReference ?? null,
    lastAt: latest?.receivedAt.toISOString() ?? null,
  };
}

async function buildOrderPositions(
  context: BusinessPrincipalContext,
): Promise<CanonicalCodOrderPosition[]> {
  const orders = await context.prisma.order.findMany({
    where: {
      deletedAt: null,
      status: "delivered",
      deliveryState: "delivered",
      codState: { not: null },
    },
    select: {
      id: true,
      orderNumber: true,
      version: true,
      source: true,
      sourceMetadata: true,
      totalPrice: true,
      codState: true,
      customer: { select: { name: true } },
    },
    orderBy: { deliveredAt: "desc" },
    take: 5000,
  });
  const canonical = orders.filter((order) =>
    isTrustedManualOrderAuthority(order.source, order.sourceMetadata),
  );
  const orderIds = canonical.map((order) => order.id);
  if (orderIds.length === 0) return [];

  const [collections, lines] = await Promise.all([
    context.prisma.codCollection.findMany({
      where: { orderId: { in: orderIds } },
      include: { corrections: true },
    }),
    context.prisma.codSettlementLine.findMany({
      where: { orderId: { in: orderIds } },
      include: {
        corrections: true,
        settlement: { select: { externalReference: true, receivedAt: true } },
      },
    }),
  ]);
  const collectionByOrder = new Map(collections.map((entry) => [entry.orderId, entry]));
  const linesByOrder = new Map<string, typeof lines>();
  for (const line of lines) {
    if (!line.orderId) continue;
    const current = linesByOrder.get(line.orderId) ?? [];
    current.push(line);
    linesByOrder.set(line.orderId, current);
  }

  return canonical.map((order) => {
    const collection = collectionByOrder.get(order.id) ?? null;
    const collected = collectionAmount(collection);
    const lineSummary = lineAmounts(linesByOrder.get(order.id) ?? []);
    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      orderVersion: order.version,
      customerName: order.customer.name,
      provider: collection?.provider ?? null,
      codState: order.codState,
      expectedReceivable: order.totalPrice,
      effectiveCollected: collected,
      grossRemitted: lineSummary.gross,
      fees: lineSummary.fees,
      adjustments: lineSummary.adjustments,
      netReceived: lineSummary.net,
      discrepancy: lineSummary.discrepancy,
      outstandingCollection: Math.max(0, order.totalPrice - collected),
      outstandingRemittance: Math.max(0, collected - lineSummary.gross),
      collectionReference: collection?.reference ?? null,
      collectedAt: collection?.collectedAt.toISOString() ?? null,
      lastSettlementReference: lineSummary.lastReference,
      lastSettlementAt: lineSummary.lastAt,
    };
  });
}

export async function getCanonicalCodOrderPosition(
  context: BusinessPrincipalContext,
  orderId: string,
): Promise<CanonicalCodOrderPosition> {
  const positions = await buildOrderPositions(context);
  const position = positions.find((entry) => entry.orderId === orderId);
  if (!position) throw new NotFoundError("Canonical COD position", orderId);
  return position;
}

export async function getCanonicalCodWorkspaceSummary(
  context: BusinessPrincipalContext,
): Promise<CanonicalCodWorkspaceSummary> {
  const positions = await buildOrderPositions(context);
  const recentSettlements = await context.prisma.codSettlement.findMany({
    orderBy: { receivedAt: "desc" },
    take: 100,
    include: { _count: { select: { lines: true } } },
  });
  const awaitingCollection = positions.filter(
    (entry) => entry.outstandingCollection > 0 && entry.codState === "receivable",
  );
  const awaitingRemittance = positions.filter(
    (entry) =>
      entry.effectiveCollected > 0 &&
      entry.outstandingRemittance > 0 &&
      entry.codState !== "disputed",
  );
  const disputed = positions.filter(
    (entry) => entry.codState === "disputed" || entry.discrepancy !== 0,
  );
  const settlementSummaries: CanonicalCodSettlementSummary[] = recentSettlements.map(
    (settlement) => ({
      settlementId: settlement.id,
      provider: settlement.provider,
      externalReference: settlement.externalReference,
      status: settlement.status,
      receivedAt: settlement.receivedAt.toISOString(),
      grossAmount: settlement.grossAmount,
      feeAmount: settlement.feeAmount,
      adjustmentAmount: settlement.adjustmentAmount,
      netAmount: settlement.netAmount,
      discrepancyAmount: settlement.discrepancyAmount,
      unmatchedAmount: settlement.unmatchedAmount,
      lineCount: settlement._count.lines,
    }),
  );

  return {
    totals: {
      expectedReceivable: sum(positions.map((entry) => entry.expectedReceivable)),
      effectiveCollected: sum(positions.map((entry) => entry.effectiveCollected)),
      grossRemitted: sum(positions.map((entry) => entry.grossRemitted)),
      fees: sum(positions.map((entry) => entry.fees)),
      adjustments: sum(positions.map((entry) => entry.adjustments)),
      netReceived: sum(positions.map((entry) => entry.netReceived)),
      discrepancy: sum(positions.map((entry) => entry.discrepancy)),
      unmatched: sum(settlementSummaries.map((entry) => entry.unmatchedAmount)),
      outstandingCollection: sum(
        positions.map((entry) => entry.outstandingCollection),
      ),
      outstandingRemittance: sum(
        positions.map((entry) => entry.outstandingRemittance),
      ),
    },
    counts: {
      receivable: positions.length,
      awaitingCollection: awaitingCollection.length,
      awaitingRemittance: awaitingRemittance.length,
      disputed: disputed.length,
      remitted: positions.filter((entry) => entry.codState === "remitted").length,
      settlementsNeedingReview: settlementSummaries.filter(
        (entry) => entry.status === "needs_review",
      ).length,
    },
    awaitingCollection,
    awaitingRemittance,
    disputed,
    recentSettlements: settlementSummaries,
  };
}
