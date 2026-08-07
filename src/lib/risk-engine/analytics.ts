import "server-only";

import type { ServiceContext } from "@/lib/data/service-base";
import { getRiskConfig, getRiskRules } from "./service";
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
  kpis: {
    avgRiskScore: number;
    confirmationRate: number;
    returnRate: number;
    highRiskOrderCount: number;
    blacklistedCustomerCount: number;
    potentialSavingsDzd: number;
  };
}

interface HistoryAccumulator {
  totalOrders: number;
  deliveredCount: number;
  returnedCount: number;
  refusedCount: number;
  cancelledCount: number;
  totalSpent: number;
  firstOrderDate: Date | null;
  lastOrderDate: Date | null;
}

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

  const [config, rules, orders] = await Promise.all([
    getRiskConfig(context),
    getRiskRules(context),
    db.order.findMany({
      where: { createdAt: { gte: since }, deletedAt: null },
      select: {
        id: true,
        status: true,
        totalPrice: true,
        wilaya: true,
        commune: true,
        address: true,
        phone: true,
        source: true,
        createdAt: true,
        customerId: true,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
  ]);

  const customerIds = [...new Set(orders.map((order) => order.customerId))];
  const wilayas = [...new Set(orders.map((order) => order.wilaya))];
  const [historyRows, customers, wilayaProfiles, blacklistedCustomerCount] =
    await Promise.all([
      customerIds.length
        ? db.order.findMany({
            where: { customerId: { in: customerIds }, deletedAt: null },
            select: {
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

  const historyMap = new Map<string, HistoryAccumulator>();
  for (const row of historyRows) {
    const history = historyMap.get(row.customerId) ?? {
      totalOrders: 0,
      deliveredCount: 0,
      returnedCount: 0,
      refusedCount: 0,
      cancelledCount: 0,
      totalSpent: 0,
      firstOrderDate: null,
      lastOrderDate: null,
    };
    history.totalOrders += 1;
    if (row.status === "delivered") history.deliveredCount += 1;
    if (row.status === "returned") history.returnedCount += 1;
    if (row.status === "refused") history.refusedCount += 1;
    if (row.status === "cancelled") history.cancelledCount += 1;
    if (!['cancelled', 'draft'].includes(row.status)) {
      history.totalSpent += row.totalPrice;
    }
    history.firstOrderDate ??= row.createdAt;
    history.lastOrderDate = row.createdAt;
    historyMap.set(row.customerId, history);
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
  for (const order of orders) {
    const history = historyMap.get(order.customerId);
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
      customerHistory: history
        ? {
            customerId: order.customerId,
            ...history,
            isBlacklisted: blacklistMap.get(order.customerId) ?? false,
          }
        : undefined,
      wilayaRisk: profile
        ? {
            riskLevel: profile.riskLevel,
            confirmationRate: profile.confirmationRate ?? 0,
            returnRate: profile.returnRate ?? 0,
          }
        : null,
    };
    assessments.push({
      orderId: order.id,
      assessment: assessRisk(input, config, rules),
      status: order.status,
      wilaya: order.wilaya,
      createdAt: order.createdAt,
      totalPrice: order.totalPrice,
    });
  }

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
    const levelOrders = assessments.filter((row) => row.assessment.level === level);
    const delivered = levelOrders.filter((row) => row.status === "delivered").length;
    const returned = levelOrders.filter((row) => row.status === "returned").length;
    const refused = levelOrders.filter((row) => row.status === "refused").length;
    const cancelled = levelOrders.filter((row) => row.status === "cancelled").length;
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
      const delivered = data.statuses.filter((status) => status === "delivered").length;
      return {
        wilaya,
        orderCount: data.scores.length,
        avgScore: Math.round(data.scores.reduce((sum, score) => sum + score, 0) / data.scores.length),
        confirmationRate: completed.length > 0 ? delivered / completed.length : 0,
      };
    })
    .sort((left, right) => right.orderCount - left.orderCount)
    .slice(0, 10);

  const factors = new Map<string, { count: number; points: number; labelKey: string }>();
  for (const row of assessments) {
    for (const factor of row.assessment.factors) {
      const current = factors.get(factor.id) ?? {
        count: 0,
        points: 0,
        labelKey: factor.labelKey,
      };
      current.count += 1;
      current.points += factor.points;
      factors.set(factor.id, current);
    }
  }
  const topFactors = [...factors.entries()]
    .map(([factorId, data]) => ({
      factorId,
      labelKey: data.labelKey,
      occurrenceCount: data.count,
      avgPoints: data.count > 0 ? Math.round(data.points / data.count) : 0,
    }))
    .sort((left, right) => right.occurrenceCount - left.occurrenceCount)
    .slice(0, 8);

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
      avgScore: Math.round(data.scores.reduce((sum, score) => sum + score, 0) / data.scores.length),
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
  const avgRiskScore = scores.length > 0
    ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
    : 0;
  const completedOrders = assessments.filter((row) =>
    ["delivered", "returned", "refused"].includes(row.status),
  );
  const deliveredCount = completedOrders.filter((row) => row.status === "delivered").length;
  const returnedCount = completedOrders.filter(
    (row) => row.status === "returned" || row.status === "refused",
  ).length;
  const confirmationRate = completedOrders.length > 0
    ? deliveredCount / completedOrders.length
    : 0;
  const returnRate = completedOrders.length > 0
    ? returnedCount / completedOrders.length
    : 0;
  const highRiskOrderCount = assessments.filter(
    (row) => row.assessment.level === "high" || row.assessment.level === "critical",
  ).length;
  const returnedHighRisk = assessments.filter(
    (row) =>
      (row.assessment.level === "high" || row.assessment.level === "critical") &&
      (row.status === "returned" || row.status === "refused"),
  ).length;

  return {
    totalOrders,
    distribution,
    confirmationByLevel,
    riskByWilaya,
    topFactors,
    trend,
    ruleTriggers,
    kpis: {
      avgRiskScore,
      confirmationRate,
      returnRate,
      highRiskOrderCount,
      blacklistedCustomerCount,
      potentialSavingsDzd: returnedHighRisk * 600,
    },
  };
}
