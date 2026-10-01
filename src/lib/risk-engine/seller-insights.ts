import type { RiskLevel } from "./types";

/**
 * Seller-facing risk insights: where COD money is lost to parcels that come
 * back, and whether the risk score actually separates good orders from bad.
 *
 * Pure: the analytics service scores every order with history as it stood at
 * order time (no look-ahead) and hands the rows here. "Lost" money is the
 * delivery cost actually recorded for returned/refused parcels (courier cost
 * when known, otherwise the order's delivery fee) — never an estimate.
 */

const DELIVERED = "delivered";
const CAME_BACK = new Set(["returned", "refused"]);
const OPEN = new Set(["draft", "pending", "confirmed"]);
/** Below this many finished orders, a rate is shown but flagged as early. */
export const MIN_SAMPLE = 5;

export interface InsightOrderRow {
  orderId: string;
  orderNumber: string;
  status: string;
  wilaya: string;
  source: string;
  totalPrice: number;
  /** Recorded delivery cost for this parcel, or null when unknown. */
  cost: number | null;
  products: Array<{ key: string; name: string }>;
  customerId: string;
  customerName: string | null;
  isBlacklisted: boolean;
  level: RiskLevel;
  score: number;
  factors: Array<{ id: string; labelKey: string; points: number }>;
  /** Label keys of rules (or the blacklist hold) that forced the level. */
  overrides: string[];
  createdAt: Date;
}

export interface OutcomeGroup {
  key: string;
  label: string;
  completed: number;
  delivered: number;
  cameBack: number;
  returnRate: number;
  lostDzd: number;
  /** Fewer than MIN_SAMPLE finished orders: read with care. */
  early: boolean;
}

export interface SellerInsights {
  outcomes: {
    completed: number;
    delivered: number;
    cameBack: number;
    deliverySuccessRate: number;
    returnRate: number;
    lostToReturnsDzd: number;
    unknownCostReturns: number;
    /** Losses on parcels the score had flagged high/critical before shipping. */
    preventableLossDzd: number;
    preventableReturns: number;
  };
  returnTrend: Array<{ week: string; completed: number; returnRate: number }>;
  scoreCheck: {
    byLevel: Array<{ level: RiskLevel; completed: number; returnRate: number }>;
    /** How many times more often high/critical orders came back than low ones. */
    lift: number | null;
  };
  lossByWilaya: OutcomeGroup[];
  lossByProduct: OutcomeGroup[];
  lossBySource: OutcomeGroup[];
  repeatRefusers: Array<{
    customerId: string;
    name: string | null;
    cameBack: number;
    lostDzd: number;
    isBlacklisted: boolean;
  }>;
  warningSigns: Array<{
    factorId: string;
    labelKey: string;
    completed: number;
    returnRate: number;
    /** Return rate with this sign ÷ overall return rate. */
    lift: number;
  }>;
}

function weekKey(date: Date): string {
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const weekday = (day.getUTCDay() + 6) % 7; // Monday = 0
  day.setUTCDate(day.getUTCDate() - weekday);
  return day.toISOString().slice(0, 10);
}

function group(
  rows: readonly InsightOrderRow[],
  keyOf: (row: InsightOrderRow) => Array<{ key: string; label: string }>,
  limit: number,
): OutcomeGroup[] {
  const groups = new Map<string, OutcomeGroup>();
  for (const row of rows) {
    const finished = row.status === DELIVERED || CAME_BACK.has(row.status);
    if (!finished) continue;
    for (const { key, label } of keyOf(row)) {
      const entry = groups.get(key) ?? {
        key,
        label,
        completed: 0,
        delivered: 0,
        cameBack: 0,
        returnRate: 0,
        lostDzd: 0,
        early: true,
      };
      entry.completed += 1;
      if (row.status === DELIVERED) entry.delivered += 1;
      if (CAME_BACK.has(row.status)) {
        entry.cameBack += 1;
        entry.lostDzd += row.cost ?? 0;
      }
      groups.set(key, entry);
    }
  }
  return [...groups.values()]
    .map((entry) => ({
      ...entry,
      returnRate: entry.completed > 0 ? entry.cameBack / entry.completed : 0,
      early: entry.completed < MIN_SAMPLE,
    }))
    .filter((entry) => entry.cameBack > 0 || entry.completed >= MIN_SAMPLE)
    .sort(
      (left, right) =>
        right.lostDzd - left.lostDzd ||
        right.cameBack - left.cameBack ||
        right.returnRate - left.returnRate ||
        left.label.localeCompare(right.label),
    )
    .slice(0, limit);
}

export function buildSellerInsights(rows: readonly InsightOrderRow[]): SellerInsights {
  const finished = rows.filter((row) => row.status === DELIVERED || CAME_BACK.has(row.status));
  const delivered = finished.filter((row) => row.status === DELIVERED).length;
  const cameBackRows = finished.filter((row) => CAME_BACK.has(row.status));
  const flagged = (row: InsightOrderRow) => row.level === "high" || row.level === "critical";
  const overallReturnRate = finished.length > 0 ? cameBackRows.length / finished.length : 0;

  const weeks = new Map<string, { completed: number; cameBack: number }>();
  for (const row of finished) {
    const key = weekKey(row.createdAt);
    const entry = weeks.get(key) ?? { completed: 0, cameBack: 0 };
    entry.completed += 1;
    if (CAME_BACK.has(row.status)) entry.cameBack += 1;
    weeks.set(key, entry);
  }

  const levels: RiskLevel[] = ["low", "medium", "high", "critical"];
  const byLevel = levels.map((level) => {
    const levelRows = finished.filter((row) => row.level === level);
    const back = levelRows.filter((row) => CAME_BACK.has(row.status)).length;
    return { level, completed: levelRows.length, returnRate: levelRows.length ? back / levelRows.length : 0 };
  });
  const lowRows = finished.filter((row) => row.level === "low");
  const riskyRows = finished.filter(flagged);
  const lowRate = lowRows.length ? lowRows.filter((row) => CAME_BACK.has(row.status)).length / lowRows.length : 0;
  const riskyRate = riskyRows.length ? riskyRows.filter((row) => CAME_BACK.has(row.status)).length / riskyRows.length : 0;
  const lift =
    lowRows.length >= MIN_SAMPLE && riskyRows.length >= MIN_SAMPLE && lowRate > 0
      ? Math.round((riskyRate / lowRate) * 10) / 10
      : null;

  const refusers = new Map<string, SellerInsights["repeatRefusers"][number]>();
  for (const row of cameBackRows) {
    const entry = refusers.get(row.customerId) ?? {
      customerId: row.customerId,
      name: row.customerName,
      cameBack: 0,
      lostDzd: 0,
      isBlacklisted: row.isBlacklisted,
    };
    entry.cameBack += 1;
    entry.lostDzd += row.cost ?? 0;
    refusers.set(row.customerId, entry);
  }

  const signs = new Map<string, { labelKey: string; completed: number; cameBack: number }>();
  for (const row of finished) {
    for (const factor of row.factors) {
      if (factor.points <= 0) continue;
      const entry = signs.get(factor.id) ?? { labelKey: factor.labelKey, completed: 0, cameBack: 0 };
      entry.completed += 1;
      if (CAME_BACK.has(row.status)) entry.cameBack += 1;
      signs.set(factor.id, entry);
    }
  }

  return {
    outcomes: {
      completed: finished.length,
      delivered,
      cameBack: cameBackRows.length,
      deliverySuccessRate: finished.length > 0 ? delivered / finished.length : 0,
      returnRate: overallReturnRate,
      lostToReturnsDzd: cameBackRows.reduce((sum, row) => sum + (row.cost ?? 0), 0),
      unknownCostReturns: cameBackRows.filter((row) => row.cost === null).length,
      preventableLossDzd: cameBackRows.filter(flagged).reduce((sum, row) => sum + (row.cost ?? 0), 0),
      preventableReturns: cameBackRows.filter(flagged).length,
    },
    returnTrend: [...weeks.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([week, entry]) => ({
        week,
        completed: entry.completed,
        returnRate: entry.completed > 0 ? entry.cameBack / entry.completed : 0,
      })),
    scoreCheck: { byLevel, lift },
    lossByWilaya: group(rows, (row) => [{ key: row.wilaya, label: row.wilaya }], 12),
    lossByProduct: group(rows, (row) => row.products.map((product) => ({ key: product.key, label: product.name })), 10),
    lossBySource: group(rows, (row) => [{ key: row.source, label: row.source }], 8),
    repeatRefusers: [...refusers.values()]
      .filter((entry) => entry.cameBack >= 2)
      .sort((left, right) => right.cameBack - left.cameBack || right.lostDzd - left.lostDzd)
      .slice(0, 10),
    warningSigns: [...signs.entries()]
      .filter(([, entry]) => entry.completed >= 3)
      .map(([factorId, entry]) => {
        const returnRate = entry.cameBack / entry.completed;
        return {
          factorId,
          labelKey: entry.labelKey,
          completed: entry.completed,
          returnRate,
          lift: overallReturnRate > 0 ? Math.round((returnRate / overallReturnRate) * 10) / 10 : 0,
        };
      })
      .sort((left, right) => right.lift - left.lift || right.completed - left.completed)
      .slice(0, 8),
  };
}

/** Open orders the score flags, highest first: the "check before you ship" queue. */
export function openRiskyOrders(rows: readonly InsightOrderRow[], limit = 12) {
  return rows
    .filter((row) => OPEN.has(row.status) && (row.level === "high" || row.level === "critical"))
    .sort((left, right) => right.score - left.score || right.createdAt.getTime() - left.createdAt.getTime())
    .slice(0, limit)
    .map((row) => ({
      orderId: row.orderId,
      orderNumber: row.orderNumber,
      customerName: row.customerName,
      wilaya: row.wilaya,
      totalPrice: row.totalPrice,
      status: row.status,
      score: row.score,
      level: row.level,
      // A rule or the blacklist can force the level above what the score
      // says; name that first so a "critical, score 23" order explains itself.
      reasons: [
        ...row.overrides,
        ...row.factors
          .filter((factor) => factor.points > 0)
          .sort((left, right) => right.points - left.points)
          .map((factor) => factor.labelKey),
      ]
        .filter((key, index, all) => all.indexOf(key) === index)
        .slice(0, 3),
      createdAt: row.createdAt.toISOString(),
    }));
}
