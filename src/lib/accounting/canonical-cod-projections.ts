import "server-only";

import type { BusinessPrincipalContext } from "@/lib/business-truth/principal";
import { isTrustedManualOrderAuthority } from "@/lib/orders/manual-order-authority";
import { ConflictError, NotFoundError } from "@/types/errors";

export interface CanonicalCodOrderPosition {
  orderId: string;
  orderNumber: string;
  orderVersion: number;
  customerName: string;
  collectionId: string | null;
  provider: string | null;
  codState: string;
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
  status: "posted" | "needs_review";
  receivedAt: string;
  grossAmount: number;
  feeAmount: number;
  adjustmentAmount: number;
  netAmount: number;
  discrepancyAmount: number;
  unmatchedAmount: number;
  lineCount: number;
}

export interface CanonicalCodReviewLine {
  lineId: string;
  settlementId: string;
  provider: string;
  externalReference: string;
  receivedAt: string;
  providerLineReference: string | null;
  orderId: string | null;
  orderNumber: string | null;
  orderVersion: number | null;
  unresolvedUnmatched: boolean;
  effectiveGross: number;
  effectiveFee: number;
  effectiveAdjustment: number;
  effectiveNet: number;
  effectiveDiscrepancy: number;
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
  reviewLines: CanonicalCodReviewLine[];
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function deriveCodState(input: {
  expectedReceivable: number;
  effectiveCollected: number;
  grossRemitted: number;
  settlementDiscrepancy: number;
}): string {
  if (input.effectiveCollected <= 0) return "receivable";
  if (
    input.effectiveCollected !== input.expectedReceivable ||
    input.settlementDiscrepancy !== 0 ||
    input.grossRemitted > input.effectiveCollected
  ) {
    return "disputed";
  }
  if (input.grossRemitted <= 0) return "collected";
  if (input.grossRemitted < input.effectiveCollected) {
    return "partially_remitted";
  }
  return "remitted";
}

function collectionAmount(collection: {
  amount: number;
  corrections: Array<{ amountDelta: number }>;
} | null): number {
  if (!collection) return 0;
  return collection.amount + sum(collection.corrections.map((entry) => entry.amountDelta));
}

type SettlementLineShape = {
  id: string;
  orderId: string | null;
  grossRemittedAmount: number;
  feeAmount: number;
  adjustmentAmount: number;
  discrepancyAmount: number;
  providerLineReference: string | null;
  corrections: Array<{
    grossDelta: number;
    feeDelta: number;
    adjustmentDelta: number;
    discrepancyDelta: number;
  }>;
  match: {
    orderId: string;
    discrepancyAmount: number;
  } | null;
  settlement: {
    id: string;
    provider: string;
    externalReference: string;
    receivedAt: Date;
  };
};

function effectiveLineAmounts(line: SettlementLineShape): {
  gross: number;
  fees: number;
  adjustments: number;
  net: number;
  discrepancy: number;
} {
  const gross =
    line.grossRemittedAmount +
    sum(line.corrections.map((entry) => entry.grossDelta));
  const fees =
    line.feeAmount +
    sum(line.corrections.map((entry) => entry.feeDelta));
  const adjustments =
    line.adjustmentAmount +
    sum(line.corrections.map((entry) => entry.adjustmentDelta));
  const discrepancy =
    line.discrepancyAmount +
    sum(line.corrections.map((entry) => entry.discrepancyDelta)) +
    (line.match?.discrepancyAmount ?? 0);
  return {
    gross,
    fees,
    adjustments,
    net: gross - fees + adjustments,
    discrepancy,
  };
}

function lineAmounts(lines: SettlementLineShape[]): {
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
    const effective = effectiveLineAmounts(line);
    gross += effective.gross;
    fees += effective.fees;
    adjustments += effective.adjustments;
    discrepancy += effective.discrepancy;
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

  const [receivableMovements, collections, lines] = await Promise.all([
    context.prisma.financialMovement.findMany({
      where: {
        orderId: { in: orderIds },
        movementType: "cod_receivable_created",
        currency: "DZD",
      },
      select: { orderId: true, amount: true },
    }),
    context.prisma.codCollection.findMany({
      where: { orderId: { in: orderIds } },
      include: { corrections: true },
    }),
    context.prisma.codSettlementLine.findMany({
      where: {
        OR: [
          { orderId: { in: orderIds } },
          { match: { is: { orderId: { in: orderIds } } } },
        ],
      },
      include: {
        corrections: true,
        match: true,
        settlement: {
          select: {
            id: true,
            provider: true,
            externalReference: true,
            receivedAt: true,
          },
        },
      },
    }),
  ]);

  const receivableByOrder = new Map<string, { count: number; amount: number }>();
  for (const movement of receivableMovements) {
    if (!movement.orderId) continue;
    const current = receivableByOrder.get(movement.orderId) ?? {
      count: 0,
      amount: 0,
    };
    current.count += 1;
    current.amount += movement.amount;
    receivableByOrder.set(movement.orderId, current);
  }
  const collectionByOrder = new Map(
    collections.map((entry) => [entry.orderId, entry]),
  );
  const linesByOrder = new Map<string, SettlementLineShape[]>();
  for (const line of lines) {
    const orderId = line.orderId ?? line.match?.orderId;
    if (!orderId) continue;
    const current = linesByOrder.get(orderId) ?? [];
    current.push(line as SettlementLineShape);
    linesByOrder.set(orderId, current);
  }

  return canonical.map((order) => {
    const receivable = receivableByOrder.get(order.id);
    if (!receivable || receivable.count !== 1 || receivable.amount <= 0) {
      throw new ConflictError(
        `Canonical COD position for order ${order.id} requires exactly one positive delivered receivable movement`,
      );
    }
    const collection = collectionByOrder.get(order.id) ?? null;
    const expectedReceivable = receivable.amount;
    const collected = collectionAmount(collection);
    const lineSummary = lineAmounts(linesByOrder.get(order.id) ?? []);
    const codState = deriveCodState({
      expectedReceivable,
      effectiveCollected: collected,
      grossRemitted: lineSummary.gross,
      settlementDiscrepancy: lineSummary.discrepancy,
    });
    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      orderVersion: order.version,
      customerName: order.customer.name,
      collectionId: collection?.id ?? null,
      provider: collection?.provider ?? null,
      codState,
      expectedReceivable,
      effectiveCollected: collected,
      grossRemitted: lineSummary.gross,
      fees: lineSummary.fees,
      adjustments: lineSummary.adjustments,
      netReceived: lineSummary.net,
      discrepancy:
        collected - expectedReceivable + lineSummary.discrepancy,
      outstandingCollection: Math.max(0, expectedReceivable - collected),
      outstandingRemittance: Math.max(0, collected - lineSummary.gross),
      collectionReference: collection?.reference ?? null,
      collectedAt: collection?.collectedAt.toISOString() ?? null,
      lastSettlementReference: lineSummary.lastReference,
      lastSettlementAt: lineSummary.lastAt,
    };
  });
}

async function buildSettlementSummaries(
  context: BusinessPrincipalContext,
): Promise<{
  summaries: CanonicalCodSettlementSummary[];
  reviewLines: CanonicalCodReviewLine[];
}> {
  const settlements = await context.prisma.codSettlement.findMany({
    orderBy: { receivedAt: "desc" },
    take: 100,
    include: {
      lines: {
        include: {
          corrections: true,
          match: true,
        },
      },
    },
  });
  const matchedOrderIds = Array.from(
    new Set(
      settlements.flatMap((settlement) =>
        settlement.lines.flatMap((line) => {
          const orderId = line.orderId ?? line.match?.orderId;
          return orderId ? [orderId] : [];
        }),
      ),
    ),
  );
  const orders = matchedOrderIds.length
    ? await context.prisma.order.findMany({
        where: { id: { in: matchedOrderIds }, deletedAt: null },
        select: { id: true, orderNumber: true, version: true },
      })
    : [];
  const orderById = new Map(orders.map((order) => [order.id, order]));

  const summaries: CanonicalCodSettlementSummary[] = [];
  const reviewLines: CanonicalCodReviewLine[] = [];
  for (const settlement of settlements) {
    let grossAmount = 0;
    let feeAmount = 0;
    let adjustmentAmount = 0;
    let discrepancyAmount = 0;
    let unmatchedAmount = 0;
    let needsReview = false;

    for (const rawLine of settlement.lines) {
      const line = {
        ...rawLine,
        settlement: {
          id: settlement.id,
          provider: settlement.provider,
          externalReference: settlement.externalReference,
          receivedAt: settlement.receivedAt,
        },
      } as SettlementLineShape;
      const effective = effectiveLineAmounts(line);
      const orderId = line.orderId ?? line.match?.orderId ?? null;
      const unresolvedUnmatched = !orderId;
      grossAmount += effective.gross;
      feeAmount += effective.fees;
      adjustmentAmount += effective.adjustments;
      discrepancyAmount += effective.discrepancy;
      if (unresolvedUnmatched) unmatchedAmount += effective.gross;
      if (unresolvedUnmatched || effective.discrepancy !== 0) {
        needsReview = true;
        const order = orderId ? orderById.get(orderId) : null;
        reviewLines.push({
          lineId: line.id,
          settlementId: settlement.id,
          provider: settlement.provider,
          externalReference: settlement.externalReference,
          receivedAt: settlement.receivedAt.toISOString(),
          providerLineReference: line.providerLineReference,
          orderId,
          orderNumber: order?.orderNumber ?? null,
          orderVersion: order?.version ?? null,
          unresolvedUnmatched,
          effectiveGross: effective.gross,
          effectiveFee: effective.fees,
          effectiveAdjustment: effective.adjustments,
          effectiveNet: effective.net,
          effectiveDiscrepancy: effective.discrepancy,
        });
      }
    }

    summaries.push({
      settlementId: settlement.id,
      provider: settlement.provider,
      externalReference: settlement.externalReference,
      status: needsReview ? "needs_review" : "posted",
      receivedAt: settlement.receivedAt.toISOString(),
      grossAmount,
      feeAmount,
      adjustmentAmount,
      netAmount: grossAmount - feeAmount + adjustmentAmount,
      discrepancyAmount,
      unmatchedAmount,
      lineCount: settlement.lines.length,
    });
  }

  return { summaries, reviewLines };
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
  const [positions, settlementData] = await Promise.all([
    buildOrderPositions(context),
    buildSettlementSummaries(context),
  ]);
  const awaitingCollection = positions.filter(
    (entry) => entry.collectionId === null && entry.outstandingCollection > 0,
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

  return {
    totals: {
      expectedReceivable: sum(positions.map((entry) => entry.expectedReceivable)),
      effectiveCollected: sum(positions.map((entry) => entry.effectiveCollected)),
      grossRemitted: sum(positions.map((entry) => entry.grossRemitted)),
      fees: sum(positions.map((entry) => entry.fees)),
      adjustments: sum(positions.map((entry) => entry.adjustments)),
      netReceived: sum(positions.map((entry) => entry.netReceived)),
      discrepancy: sum(positions.map((entry) => entry.discrepancy)),
      unmatched: sum(
        settlementData.summaries.map((entry) => entry.unmatchedAmount),
      ),
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
      settlementsNeedingReview: settlementData.summaries.filter(
        (entry) => entry.status === "needs_review",
      ).length,
    },
    awaitingCollection,
    awaitingRemittance,
    disputed,
    recentSettlements: settlementData.summaries,
    reviewLines: settlementData.reviewLines,
  };
}
