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

/** Why a delivered canonical order could not be turned into a COD position. */
export type CanonicalCodFlagReason =
  | "receivable_missing"
  | "receivable_duplicated"
  | "receivable_not_positive";

/**
 * One delivered order whose receivable record is inconsistent (MNY-03). It is
 * reported instead of failing the whole workspace. Reason code only: no
 * customer name and no amount ever leaves through this list.
 */
export interface CanonicalCodFlaggedOrder {
  orderId: string;
  orderNumber: string;
  reason: CanonicalCodFlagReason;
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
    /** Delivered orders left out because their receivable record is inconsistent. */
    flagged: number;
  };
  awaitingCollection: CanonicalCodOrderPosition[];
  awaitingRemittance: CanonicalCodOrderPosition[];
  disputed: CanonicalCodOrderPosition[];
  recentSettlements: CanonicalCodSettlementSummary[];
  reviewLines: CanonicalCodReviewLine[];
  /** Orders left out of every list and total above (MNY-03). */
  flaggedOrders: CanonicalCodFlaggedOrder[];
  /**
   * True when a hard cap stopped the read (MNY-01): more delivered orders
   * than ORDER_HARD_CAP, or more settlements than SETTLEMENT_HARD_CAP, exist,
   * so the totals above cover only the newest rows. Below the caps every
   * order and settlement is read, in pages.
   */
  truncated: { orders: boolean; settlements: boolean };
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

/**
 * Per-order gap between what was expected and what actually arrived.
 *
 * A gap only exists once something was recorded: a collection fact or a
 * settlement line. A delivered order that is simply not collected yet owes
 * its whole amount, which is `outstandingCollection`, not a discrepancy:
 * counting it as `-expectedReceivable` put every pending order in the
 * "disputed" bucket (MNY-02). A collection that was later corrected down to
 * zero is still a recorded fact, so it keeps its real shortfall.
 */
export function computeCodPositionDiscrepancy(input: {
  hasCollection: boolean;
  hasSettlementLines: boolean;
  expectedReceivable: number;
  effectiveCollected: number;
  settlementDiscrepancy: number;
}): number {
  if (!input.hasCollection && !input.hasSettlementLines) return 0;
  return (
    input.effectiveCollected -
    input.expectedReceivable +
    input.settlementDiscrepancy
  );
}

/** Disputed = the state machine says so, or a recorded gap is non-zero. */
export function isDisputedCodPosition(position: {
  codState: string;
  discrepancy: number;
}): boolean {
  return position.codState === "disputed" || position.discrepancy !== 0;
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

/**
 * Delivered orders are read in pages of this size, newest first. The page also bounds every IN list the position
 * builder sends (SQLite allows 32,766 variables per statement), so it must stay far below that.
 */
const ORDER_PAGE = 1000;
/**
 * Delivered orders read in all; one more is fetched to know that the cap cut the read (MNY-01). Orders are read by id, so when the cap
 * cuts the read it leaves out the oldest created orders. Measured on SQLite: 60,000 orders read in a few seconds, linear in the count.
 */
const ORDER_HARD_CAP = 100_000;
/** Settlements (each with its lines) are read in pages of this size, newest first. */
const SETTLEMENT_PAGE = 100;
/** Settlements read in all; one more is fetched to know that the cap cut the read (MNY-01). */
const SETTLEMENT_HARD_CAP = 2000;
/** The settlement list the workspace shows; totals and review counts cover every settlement read. */
const SETTLEMENT_DISPLAY = 100;
/** Ids per IN list when a page of settlement lines points at orders. */
const ID_LIST_CHUNK = 1000;

/** The part of an order row the position builder reads. */
interface DeliveredOrderRow {
  id: string;
  orderNumber: string;
  version: number;
  deliveredAt: Date | null;
  source: unknown;
  sourceMetadata: unknown;
  customer: { name: string };
}

const DELIVERED_ORDER_SELECT = {
  id: true,
  orderNumber: true,
  version: true,
  deliveredAt: true,
  source: true,
  sourceMetadata: true,
  customer: { select: { name: true } },
} as const;

const DELIVERED_ORDER_WHERE = {
  deletedAt: null,
  status: "delivered",
  deliveryState: "delivered",
  codState: { not: null },
} as const;

interface CanonicalCodOrderPositions {
  positions: CanonicalCodOrderPosition[];
  flagged: CanonicalCodFlaggedOrder[];
  truncated: boolean;
}

function receivableFlagReason(
  receivable: { count: number; amount: number } | undefined,
): CanonicalCodFlagReason | null {
  if (!receivable) return "receivable_missing";
  if (receivable.count !== 1) return "receivable_duplicated";
  if (receivable.amount <= 0) return "receivable_not_positive";
  return null;
}

/**
 * Build the COD position of every delivered canonical order, or (with
 * `orderId`) of that one order through a direct query. The orders are read in
 * pages of ORDER_PAGE by id (the primary key: each page costs the page size, not
 * the table size, where Prisma's cursor+skip re-read every remaining row and a
 * delivery-date order has no index) up to ORDER_HARD_CAP, then listed newest
 * delivery first. The totals are exact below the cap and `truncated` is true
 * only when the cap cut the read (MNY-01). An order whose receivable record is inconsistent is flagged,
 * not thrown: one bad row must not take down the workspace or the positions
 * of unrelated orders.
 */
async function buildOrderPositions(
  context: BusinessPrincipalContext,
  options: { orderId?: string } = {},
): Promise<CanonicalCodOrderPositions> {
  if (options.orderId !== undefined) {
    const one = await context.prisma.order.findMany({
      where: { ...DELIVERED_ORDER_WHERE, id: options.orderId },
      select: DELIVERED_ORDER_SELECT,
      orderBy: { deliveredAt: "desc" },
      take: 1,
    });
    const part = await positionsForOrders(context, one);
    return { ...part, truncated: false };
  }

  const positions: CanonicalCodOrderPosition[] = [];
  const flagged: CanonicalCodFlaggedOrder[] = [];
  /** Delivery time of every order read (an order with no delivery date sorts after all the others). */
  const deliveredAtById = new Map<string, number>();
  let seen = 0;
  let cursor: string | undefined;
  let truncated = false;
  for (;;) {
    const take = Math.min(ORDER_PAGE, ORDER_HARD_CAP + 1 - seen);
    const page: DeliveredOrderRow[] = await context.prisma.order.findMany({
      where: cursor === undefined ? DELIVERED_ORDER_WHERE : { ...DELIVERED_ORDER_WHERE, id: { lt: cursor } },
      select: DELIVERED_ORDER_SELECT,
      orderBy: { id: "desc" },
      take,
    });
    const rows = seen + page.length > ORDER_HARD_CAP ? page.slice(0, ORDER_HARD_CAP - seen) : page;
    truncated = rows.length < page.length;
    for (const row of rows) deliveredAtById.set(row.id, row.deliveredAt?.getTime() ?? Number.NEGATIVE_INFINITY);
    const part = await positionsForOrders(context, rows);
    for (const position of part.positions) positions.push(position);
    for (const entry of part.flagged) flagged.push(entry);
    seen += rows.length;
    const last = page[page.length - 1];
    if (truncated || page.length < take || last === undefined) break;
    cursor = last.id;
  }
  const newestDeliveryFirst = (a: { orderId: string }, b: { orderId: string }): number => {
    const timeA = deliveredAtById.get(a.orderId) ?? Number.NEGATIVE_INFINITY;
    const timeB = deliveredAtById.get(b.orderId) ?? Number.NEGATIVE_INFINITY;
    if (timeA !== timeB) return timeB > timeA ? 1 : -1;
    return a.orderId < b.orderId ? 1 : a.orderId > b.orderId ? -1 : 0;
  };
  positions.sort(newestDeliveryFirst);
  flagged.sort(newestDeliveryFirst);
  return { positions, flagged, truncated };
}

/** The positions of one page of delivered orders. */
async function positionsForOrders(
  context: BusinessPrincipalContext,
  orders: readonly DeliveredOrderRow[],
): Promise<{ positions: CanonicalCodOrderPosition[]; flagged: CanonicalCodFlaggedOrder[] }> {
  const canonical = orders.filter((order) =>
    isTrustedManualOrderAuthority(order.source, order.sourceMetadata),
  );
  const orderIds = canonical.map((order) => order.id);
  if (orderIds.length === 0) return { positions: [], flagged: [] };

  const [receivableMovements, collections, courierDeductions, lines] = await Promise.all([
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
    context.prisma.canonicalRefund.findMany({
      where: { orderId: { in: orderIds }, method: "courier_deduction" },
      select: {
        orderId: true,
        amount: true,
        reversals: { select: { amount: true } },
      },
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
  const deductionByOrder = new Map<string, number>();
  for (const refund of courierDeductions) {
    const reversed = refund.reversals.reduce((total, entry) => total + entry.amount, 0);
    const net = refund.amount - reversed;
    if (net <= 0) continue;
    deductionByOrder.set(refund.orderId, (deductionByOrder.get(refund.orderId) ?? 0) + net);
  }
  const linesByOrder = new Map<string, SettlementLineShape[]>();
  for (const line of lines) {
    const orderId = line.orderId ?? line.match?.orderId;
    if (!orderId) continue;
    const current = linesByOrder.get(orderId) ?? [];
    current.push(line as SettlementLineShape);
    linesByOrder.set(orderId, current);
  }

  const flagged: CanonicalCodFlaggedOrder[] = [];
  const consistent: Array<{
    order: (typeof canonical)[number];
    receivableAmount: number;
  }> = [];
  for (const order of canonical) {
    const receivable = receivableByOrder.get(order.id);
    const reason = receivableFlagReason(receivable);
    if (reason !== null || receivable === undefined) {
      flagged.push({
        orderId: order.id,
        orderNumber: order.orderNumber,
        reason: reason ?? "receivable_missing",
      });
      continue;
    }
    consistent.push({ order, receivableAmount: receivable.amount });
  }

  const positions = consistent.map(({ order, receivableAmount }) => {
    const collection = collectionByOrder.get(order.id) ?? null;
    const deducted = deductionByOrder.get(order.id) ?? 0;
    // A courier deduction is cash the courier no longer owes. It is not a
    // second cash collection — the refund movement already records the money.
    const expectedReceivable = Math.max(0, receivableAmount - deducted);
    const collected = collectionAmount(collection);
    const orderLines = linesByOrder.get(order.id) ?? [];
    const lineSummary = lineAmounts(orderLines);
    const codState = deriveCodState({
      expectedReceivable,
      effectiveCollected: collected,
      grossRemitted: lineSummary.gross,
      settlementDiscrepancy: lineSummary.discrepancy,
    });
    const remittable = Math.min(collected, expectedReceivable);
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
      discrepancy: computeCodPositionDiscrepancy({
        hasCollection: collection !== null,
        hasSettlementLines: orderLines.length > 0,
        expectedReceivable,
        effectiveCollected: collected,
        settlementDiscrepancy: lineSummary.discrepancy,
      }),
      outstandingCollection: Math.max(0, expectedReceivable - collected),
      outstandingRemittance: Math.max(0, remittable - lineSummary.gross),
      collectionReference: collection?.reference ?? null,
      collectedAt: collection?.collectedAt.toISOString() ?? null,
      lastSettlementReference: lineSummary.lastReference,
      lastSettlementAt: lineSummary.lastAt,
    };
  });
  return { positions, flagged };
}

/** One page of settlements, newest first, each with its lines (the type of a row is taken from this call, so it keeps the lines). */
function readSettlementPage(context: BusinessPrincipalContext, take: number, cursor: string | undefined) {
  return context.prisma.codSettlement.findMany({
    orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
    take,
    ...(cursor !== undefined ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      lines: {
        include: {
          corrections: true,
          match: true,
        },
      },
    },
  });
}
type SettlementWithLines = Awaited<ReturnType<typeof readSettlementPage>>[number];

async function buildSettlementSummaries(
  context: BusinessPrincipalContext,
): Promise<{
  summaries: CanonicalCodSettlementSummary[];
  reviewLines: CanonicalCodReviewLine[];
  truncated: boolean;
}> {
  const summaries: CanonicalCodSettlementSummary[] = [];
  const reviewLines: CanonicalCodReviewLine[] = [];
  let seen = 0;
  let cursor: string | undefined;
  let truncated = false;
  for (;;) {
    const take = Math.min(SETTLEMENT_PAGE, SETTLEMENT_HARD_CAP + 1 - seen);
    const page = await readSettlementPage(context, take, cursor);
    const rows = seen + page.length > SETTLEMENT_HARD_CAP ? page.slice(0, SETTLEMENT_HARD_CAP - seen) : page;
    truncated = rows.length < page.length;
    await summarizeSettlementPage(context, rows, summaries, reviewLines);
    seen += rows.length;
    const last = page[page.length - 1];
    if (truncated || page.length < take || last === undefined) break;
    cursor = last.id;
  }
  return { summaries, reviewLines, truncated };
}

/** Adds one page of settlements to the summaries and to the lines that need review. */
async function summarizeSettlementPage(
  context: BusinessPrincipalContext,
  settlements: readonly SettlementWithLines[],
  summaries: CanonicalCodSettlementSummary[],
  reviewLines: CanonicalCodReviewLine[],
): Promise<void> {
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
  const orderById = new Map<string, { id: string; orderNumber: string; version: number }>();
  for (let from = 0; from < matchedOrderIds.length; from += ID_LIST_CHUNK) {
    const found = await context.prisma.order.findMany({
      where: { id: { in: matchedOrderIds.slice(from, from + ID_LIST_CHUNK) }, deletedAt: null },
      select: { id: true, orderNumber: true, version: true },
    });
    for (const order of found) orderById.set(order.id, order);
  }

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
}

export async function getCanonicalCodOrderPosition(
  context: BusinessPrincipalContext,
  orderId: string,
): Promise<CanonicalCodOrderPosition> {
  const { positions, flagged } = await buildOrderPositions(context, { orderId });
  const position = positions.find((entry) => entry.orderId === orderId);
  if (position) return position;
  if (flagged.some((entry) => entry.orderId === orderId)) {
    throw new ConflictError(
      `Canonical COD position for order ${orderId} requires exactly one positive delivered receivable movement`,
    );
  }
  throw new NotFoundError("Canonical COD position", orderId);
}

export async function getCanonicalCodWorkspaceSummary(
  context: BusinessPrincipalContext,
): Promise<CanonicalCodWorkspaceSummary> {
  const [orderData, settlementData] = await Promise.all([
    buildOrderPositions(context),
    buildSettlementSummaries(context),
  ]);
  const { positions } = orderData;
  const awaitingCollection = positions.filter(
    (entry) => entry.collectionId === null && entry.outstandingCollection > 0,
  );
  const awaitingRemittance = positions.filter(
    (entry) =>
      entry.effectiveCollected > 0 &&
      entry.outstandingRemittance > 0 &&
      entry.codState !== "disputed",
  );
  const disputed = positions.filter(isDisputedCodPosition);

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
      flagged: orderData.flagged.length,
    },
    awaitingCollection,
    awaitingRemittance,
    disputed,
    recentSettlements: settlementData.summaries.slice(0, SETTLEMENT_DISPLAY),
    reviewLines: settlementData.reviewLines,
    flaggedOrders: orderData.flagged,
    truncated: {
      orders: orderData.truncated,
      settlements: settlementData.truncated,
    },
  };
}
