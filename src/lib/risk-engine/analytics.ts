import "server-only";

import type { ServiceContext } from "@/lib/data/service-base";
import { getRiskConfig, getRiskRules } from "./service";
import { customerHistoryBefore, type HistoryOrderRow } from "./history";
import {
  buildSellerInsights,
  openRiskyOrders,
  type InsightOrderRow,
  type SellerInsights,
} from "./seller-insights";
import { assessRisk } from "./scoring";
import type {
  RiskAssessment,
  RiskAssessmentInput,
  RiskLevel,
} from "./types";

export interface RiskAnalyticsReport {
  totalOrders: number;
  distribution: Array<{ level: RiskLevel; count: number; percentage: number }>;
  confirmationByLevel: Array<{
    level: RiskLevel;
    total: number;
    delivered: number;
    returned: number;
    refused: number;
    cancelled: number;
    pending: number;
    confirmationRate: number;
    returnRate: number;
  }>;
  riskByWilaya: Array<{
    wilaya: string;
    orderCount: number;
    avgScore: number;
    confirmationRate: number;
  }>;
  topFactors: Array<{
    factorId: string;
    labelKey: string;
    occurrenceCount: number;
    avgPoints: number;
  }>;
  attentionFactors: Array<{
    factorId: string;
    labelKey: string;
    occurrenceCount: number;
    positivePoints: number;
  }>;
  trend: Array<{
    date: string;
    orderCount: number;
    avgScore: number;
    criticalCount: number;
  }>;
  ruleTriggers: Array<{
    ruleId: string;
    labelKey: string;
    triggerCount: number;
    enabled: boolean;
  }>;
  /** Seller view: real outcomes, losses and whether the score predicts returns. */
  insights: SellerInsights;
  /** Open orders the score flags high/critical, highest first. */
  openRisky: ReturnType<typeof openRiskyOrders>;
  openRiskyCount: number;
  kpis: {
    avgRiskScore: number;
    confirmationRate: number;
    returnRate: number;
    highRiskOrderCount: number;
    blacklistedCustomerCount: number;
    potentialSavingsDzd: number;
  };
}

const ORDER_SELECT = {
  id: true,
  orderNumber: true,
  status: true,
  totalPrice: true,
  deliveryCost: true,
  wilaya: true,
  commune: true,
  address: true,
  phone: true,
  source: true,
  createdAt: true,
  customerId: true,
  customer: { select: { name: true } },
  delivery: { select: { cost: true } },
  items: { select: { productId: true, productName: true } },
} as const;

/**
 * Compute risk analytics with a bounded query count.
 *
 * The previous implementation called the DB-aware assessment builder once per
 * order, which fanned out into customer-history/customer/wilaya queries for each
 * row. This implementation bulk-loads the selected orders, their complete
 * customer histories, customer blacklist flags and wilaya profiles once, then
 * runs the same pure scoring authority in memory.
 */
export async function getRiskAnalyticsReport(
  context: ServiceContext,
  days = 30,
): Promise<RiskAnalyticsReport> {
  const db = context.prisma;
  const since = new Date();
  since.setDate(since.getDate() - days);

  const [config, rules, orders, openOrders] = await Promise.all([
    getRiskConfig(context),
    getRiskRules(context),
    db.order.findMany({
      where: { createdAt: { gte: since }, deletedAt: null },
      select: ORDER_SELECT,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    // Open orders are actionable whatever the reporting window.
    db.order.findMany({
      where: { status: { in: ["draft", "pending", "confirmed"] }, deletedAt: null },
      select: ORDER_SELECT,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 300,
    }),
  ]);

  const inWindow = new Set(orders.map((order) => order.id));
  const scoredOrders = [...orders, ...openOrders.filter((open) => !inWindow.has(open.id))];
  const customerIds = [...new Set(scoredOrders.map((order) => order.customerId))];
  const wilayas = [...new Set(scoredOrders.map((order) => order.wilaya))];
  const [historyRows, customers, wilayaProfiles, blacklistedCustomerCount] =
    await Promise.all([
      customerIds.length
        ? db.order.findMany({
            where: { customerId: { in: customerIds }, deletedAt: null },
            select: {
              id: true,
              customerId: true,
              status: true,
              totalPrice: true,
              createdAt: true,
            },
            orderBy: [
              { customerId: "asc" },
              { createdAt: "asc" },
              { id: "asc" },
            ],
          })
        : Promise.resolve([]),
      customerIds.length
        ? db.customer.findMany({
            where: { id: { in: customerIds }, deletedAt: null },
            select: { id: true, isBlacklisted: true },
          })
        : Promise.resolve([]),
      wilayas.length
        ? db.wilayaRiskProfile.findMany({
            where: { wilaya: { in: wilayas } },
            select: {
              wilaya: true,
              riskLevel: true,
              confirmationRate: true,
              returnRate: true,
            },
          })
        : Promise.resolve([]),
      db.customer.count({ where: { isBlacklisted: true, deletedAt: null } }),
    ]);

  const historyByCustomer = new Map<string, HistoryOrderRow[]>();
  for (const row of historyRows) {
    const list = historyByCustomer.get(row.customerId) ?? [];
    list.push(row);
    historyByCustomer.set(row.customerId, list);
  }
  const blacklistMap = new Map(
    customers.map((customer) => [customer.id, customer.isBlacklisted]),
  );
  const wilayaMap = new Map(
    wilayaProfiles.map((profile) => [profile.wilaya, profile]),
  );

  const assessments: Array<{
    orderId: string;
    assessment: RiskAssessment;
    status: string;
    wilaya: string;
    createdAt: Date;
    totalPrice: number;
  }> = [];
  const insightRows: InsightOrderRow[] = [];
  const openRows: InsightOrderRow[] = [];
  for (const order of scoredOrders) {
    // History as it stood when the order was placed — never the order
    // itself or later outcomes (that leaked results into their own scores).
    const isBlacklisted = blacklistMap.get(order.customerId) ?? false;
    const prior = customerHistoryBefore(
      historyByCustomer.get(order.customerId) ?? [],
      order,
      order.customerId,
      isBlacklisted,
    );
    const history = prior.totalOrders > 0 || isBlacklisted ? prior : undefined;
    const profile = wilayaMap.get(order.wilaya);
    const input: RiskAssessmentInput = {
      order: {
        totalPrice: order.totalPrice,
        wilaya: order.wilaya,
        commune: order.commune,
        address: order.address,
        phone: order.phone,
        source: order.source,
        createdAt: order.createdAt,
      },
      customerHistory: history,
      wilayaRisk: profile
        ? {
            riskLevel: profile.riskLevel,
            confirmationRate: profile.confirmationRate ?? 0,
            returnRate: profile.returnRate ?? 0,
          }
        : null,
    };
    const assessment = assessRisk(input, config, rules);
    const row: InsightOrderRow = {
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      wilaya: order.wilaya,
      source: order.source,
      totalPrice: order.totalPrice,
      cost: order.delivery?.cost ?? order.deliveryCost ?? null,
      products: order.items.map((item) => ({
        key: item.productId ?? item.productName,
        name: item.productName,
      })),
      customerId: order.customerId,
      customerName: order.customer?.name ?? null,
      isBlacklisted,
      level: assessment.level,
      score: assessment.score,
      factors: assessment.factors.map((factor) => ({
        id: factor.id,
        labelKey: factor.labelKey,
        points: factor.points,
      })),
      overrides: assessment.triggeredRules.map((ruleId) =>
        ruleId === "auto_blacklist"
          ? "risk.rules.blacklistHold"
          : rules.find((rule) => rule.id === ruleId)?.labelKey ?? ruleId,
      ),
      createdAt: order.createdAt,
    };
    if (["draft", "pending", "confirmed"].includes(order.status)) openRows.push(row);
    if (!inWindow.has(order.id)) continue;
    insightRows.push(row);
    assessments.push({
      orderId: order.id,
      assessment,
      status: order.status,
      wilaya: order.wilaya,
      createdAt: order.createdAt,
      totalPrice: order.totalPrice,
    });
  }
  const insights = buildSellerInsights(insightRows);
  const openRisky = openRiskyOrders(openRows);
  const openRiskyCount = openRows.filter(
    (row) => row.level === "high" || row.level === "critical",
  ).length;

  const totalOrders = assessments.length;
  const levels: RiskLevel[] = ["low", "medium", "high", "critical"];
  const levelCounts: Record<RiskLevel, number> = {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  };
  for (const row of assessments) levelCounts[row.assessment.level] += 1;
  const distribution = levels.map((level) => ({
    level,
    count: levelCounts[level],
    percentage: totalOrders > 0 ? levelCounts[level] / totalOrders : 0,
  }));

  const confirmationByLevel = levels.map((level) => {
    const levelOrders = assessments.filter(
      (row) => row.assessment.level === level,
    );
    const delivered = levelOrders.filter(
      (row) => row.status === "delivered",
    ).length;
    const returned = levelOrders.filter(
      (row) => row.status === "returned",
    ).length;
    const refused = levelOrders.filter(
      (row) => row.status === "refused",
    ).length;
    const cancelled = levelOrders.filter(
      (row) => row.status === "cancelled",
    ).length;
    const pending = levelOrders.filter((row) =>
      ["draft", "pending", "confirmed", "shipped"].includes(row.status),
    ).length;
    const completed = delivered + returned + refused;
    return {
      level,
      total: levelOrders.length,
      delivered,
      returned,
      refused,
      cancelled,
      pending,
      confirmationRate: completed > 0 ? delivered / completed : 0,
      returnRate: completed > 0 ? (returned + refused) / completed : 0,
    };
  });

  const geography = new Map<string, { scores: number[]; statuses: string[] }>();
  for (const row of assessments) {
    const entry = geography.get(row.wilaya) ?? { scores: [], statuses: [] };
    entry.scores.push(row.assessment.score);
    entry.statuses.push(row.status);
    geography.set(row.wilaya, entry);
  }
  const riskByWilaya = [...geography.entries()]
    .map(([wilaya, data]) => {
      const completed = data.statuses.filter((status) =>
        ["delivered", "returned", "refused"].includes(status),
      );
      const delivered = data.statuses.filter(
        (status) => status === "delivered",
      ).length;
      return {
        wilaya,
        orderCount: data.scores.length,
        avgScore: Math.round(
          data.scores.reduce((sum, score) => sum + score, 0) /
            data.scores.length,
        ),
        confirmationRate:
          completed.length > 0 ? delivered / completed.length : 0,
      };
    })
    .sort(
      (left, right) =>
        right.avgScore - left.avgScore ||
        right.orderCount - left.orderCount ||
        left.wilaya.localeCompare(right.wilaya),
    )
    .slice(0, 10);

  const factors = new Map<
    string,
    { count: number; points: number; positivePoints: number; labelKey: string }
  >();
  for (const row of assessments) {
    for (const factor of row.assessment.factors) {
      const current = factors.get(factor.id) ?? {
        count: 0,
        points: 0,
        positivePoints: 0,
        labelKey: factor.labelKey,
      };
      current.count += 1;
      current.points += factor.points;
      current.positivePoints += Math.max(factor.points, 0);
      factors.set(factor.id, current);
    }
  }
  const factorRows = [...factors.entries()].map(([factorId, data]) => ({
    factorId,
    labelKey: data.labelKey,
    occurrenceCount: data.count,
    avgPoints: data.count > 0 ? Math.round(data.points / data.count) : 0,
    positivePoints: data.positivePoints,
  }));
  const topFactors = [...factorRows]
    .sort((left, right) => right.occurrenceCount - left.occurrenceCount)
    .slice(0, 8)
    .map((factor) => ({
      factorId: factor.factorId,
      labelKey: factor.labelKey,
      occurrenceCount: factor.occurrenceCount,
      avgPoints: factor.avgPoints,
    }));
  const attentionFactors = [...factorRows]
    .filter((factor) => factor.positivePoints > 0)
    .sort(
      (left, right) =>
        right.positivePoints - left.positivePoints ||
        right.occurrenceCount - left.occurrenceCount ||
        left.factorId.localeCompare(right.factorId),
    )
    .slice(0, 8)
    .map((factor) => ({
      factorId: factor.factorId,
      labelKey: factor.labelKey,
      occurrenceCount: factor.occurrenceCount,
      positivePoints: factor.positivePoints,
    }));

  const daily = new Map<string, { scores: number[]; criticalCount: number }>();
  for (const row of assessments) {
    const date = row.createdAt.toISOString().split("T")[0]!;
    const current = daily.get(date) ?? { scores: [], criticalCount: 0 };
    current.scores.push(row.assessment.score);
    if (row.assessment.level === "critical") current.criticalCount += 1;
    daily.set(date, current);
  }
  const trend = [...daily.entries()]
    .map(([date, data]) => ({
      date,
      orderCount: data.scores.length,
      avgScore: Math.round(
        data.scores.reduce((sum, score) => sum + score, 0) /
          data.scores.length,
      ),
      criticalCount: data.criticalCount,
    }))
    .sort((left, right) => left.date.localeCompare(right.date));

  const ruleTriggers = rules.map((rule) => ({
    ruleId: rule.id,
    labelKey: rule.labelKey,
    triggerCount: rule.triggerCount,
    enabled: rule.enabled,
  }));
  const scores = assessments.map((row) => row.assessment.score);
  const avgRiskScore =
    scores.length > 0
      ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
      : 0;
  const completedOrders = assessments.filter((row) =>
    ["delivered", "returned", "refused"].includes(row.status),
  );
  const deliveredCount = completedOrders.filter(
    (row) => row.status === "delivered",
  ).length;
  const returnedCount = completedOrders.filter(
    (row) => row.status === "returned" || row.status === "refused",
  ).length;
  const confirmationRate =
    completedOrders.length > 0 ? deliveredCount / completedOrders.length : 0;
  const returnRate =
    completedOrders.length > 0 ? returnedCount / completedOrders.length : 0;
  const highRiskOrderCount = assessments.filter(
    (row) =>
      row.assessment.level === "high" || row.assessment.level === "critical",
  ).length;

  return {
    totalOrders,
    distribution,
    confirmationByLevel,
    riskByWilaya,
    topFactors,
    attentionFactors,
    trend,
    ruleTriggers,
    insights,
    openRisky,
    openRiskyCount,
    kpis: {
      avgRiskScore,
      confirmationRate,
      returnRate,
      highRiskOrderCount,
      blacklistedCustomerCount,
      // Real delivery cost lost on parcels the score had flagged before
      // shipping (replaces a fixed 600 DZD-per-return estimate).
      potentialSavingsDzd: insights.outcomes.preventableLossDzd,
    },
  };
}
