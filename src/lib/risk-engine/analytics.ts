/**
 * Risk analytics — aggregates risk data across all orders for the analysis dashboard.
 *
 * Computes:
 *   - Risk distribution (how many orders at each level)
 *   - Confirmation rate BY risk level (proves the engine works — low-risk orders
 *     should have higher confirmation rates than high-risk ones)
 *   - Risk by wilaya (geographic hotspots)
 *   - Risk by product/category
 *   - Top contributing factors (which signals are most common)
 *   - Risk trend over time (are we improving?)
 *   - Rule trigger counts (which rules fire most)
 *
 * NOTE: Since risk assessments are computed on-demand (not persisted per order
 * in this iteration), this analytics module re-computes assessments for the
 * time range. For large datasets this should be cached or materialized.
 */
import "server-only";

import type { ServiceContext } from "@/lib/data/service-base";
import { getRiskConfig, getRiskRules, buildAssessmentInputFromOrder } from "./service";
import { assessRisk } from "./scoring";
import type { RiskAssessment, RiskLevel } from "./types";

export interface RiskAnalyticsReport {
  /** Total orders assessed */
  totalOrders: number;
  /** Distribution by risk level */
  distribution: Array<{ level: RiskLevel; count: number; percentage: number }>;
  /** Confirmation/delivery rate by risk level (the proof the engine works) */
  confirmationByLevel: Array<{
    level: RiskLevel;
    total: number;
    delivered: number;
    returned: number;
    refused: number;
    cancelled: number;
    pending: number;
    confirmationRate: number; // 0-1
    returnRate: number; // 0-1
  }>;
  /** Risk by wilaya (top 10 by order count) */
  riskByWilaya: Array<{
    wilaya: string;
    orderCount: number;
    avgScore: number;
    confirmationRate: number;
  }>;
  /** Top contributing factors (by frequency) */
  topFactors: Array<{
    factorId: string;
    labelKey: string;
    occurrenceCount: number;
    avgPoints: number;
  }>;
  /** Risk trend over time (daily avg score) */
  trend: Array<{
    date: string;
    orderCount: number;
    avgScore: number;
    criticalCount: number;
  }>;
  /** Rule trigger summary */
  ruleTriggers: Array<{
    ruleId: string;
    labelKey: string;
    triggerCount: number;
    enabled: boolean;
  }>;
  /** Overall KPIs */
  kpis: {
    avgRiskScore: number;
    confirmationRate: number;     // overall
    returnRate: number;           // overall
    highRiskOrderCount: number;   // high + critical
    blacklistedCustomerCount: number;
    potentialSavingsDzd: number;  // estimated savings from preventing high-risk shipments
  };
}

/** Compute the full risk analytics report for a time range (default: last 30 days). */
export async function getRiskAnalyticsReport(
  context: ServiceContext,
  days = 30,
): Promise<RiskAnalyticsReport> {
  const db = context.prisma;
  const since = new Date();
  since.setDate(since.getDate() - days);

  const [config, rules] = await Promise.all([
    getRiskConfig(context),
    getRiskRules(context),
  ]);

  // Load all orders in the range (with customer + status for aggregation)
  const orders = await db.order.findMany({
    where: { createdAt: { gte: since } },
    select: {
      id: true,
      status: true,
      totalPrice: true,
      wilaya: true,
      createdAt: true,
      customerId: true,
    },
    orderBy: { createdAt: "asc" },
  });

  // Compute assessments for each order (batch the input building)
  const assessments: Array<{ orderId: string; assessment: RiskAssessment; status: string; wilaya: string; createdAt: Date; totalPrice: number }> = [];

  for (const order of orders) {
    const input = await buildAssessmentInputFromOrder(context, order.id);
    if (!input) continue;
    const assessment = assessRisk(input, config, rules);
    assessments.push({
      orderId: order.id,
      assessment,
      status: order.status,
      wilaya: order.wilaya,
      createdAt: order.createdAt,
      totalPrice: order.totalPrice,
    });
  }

  const totalOrders = assessments.length;

  // ── Distribution ──
  const levelCounts: Record<RiskLevel, number> = { low: 0, medium: 0, high: 0, critical: 0 };
  for (const a of assessments) levelCounts[a.assessment.level]++;
  const distribution = (Object.keys(levelCounts) as RiskLevel[]).map((level) => ({
    level,
    count: levelCounts[level],
    percentage: totalOrders > 0 ? levelCounts[level] / totalOrders : 0,
  }));

  // ── Confirmation by level ──
  const confirmationByLevel = (Object.keys(levelCounts) as RiskLevel[]).map((level) => {
    const levelOrders = assessments.filter((a) => a.assessment.level === level);
    const delivered = levelOrders.filter((a) => a.status === "delivered").length;
    const returned = levelOrders.filter((a) => a.status === "returned").length;
    const refused = levelOrders.filter((a) => a.status === "refused").length;
    const cancelled = levelOrders.filter((a) => a.status === "cancelled").length;
    const pending = levelOrders.filter((a) =>
      ["draft", "pending", "confirmed", "shipped"].includes(a.status),
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

  // ── Risk by wilaya ──
  const wilayaMap = new Map<string, { scores: number[]; statuses: string[] }>();
  for (const a of assessments) {
    const entry = wilayaMap.get(a.wilaya) ?? { scores: [], statuses: [] };
    entry.scores.push(a.assessment.score);
    entry.statuses.push(a.status);
    wilayaMap.set(a.wilaya, entry);
  }
  const riskByWilaya = Array.from(wilayaMap.entries())
    .map(([wilaya, data]) => {
      const completed = data.statuses.filter((s) =>
        ["delivered", "returned", "refused"].includes(s),
      );
      const delivered = data.statuses.filter((s) => s === "delivered").length;
      return {
        wilaya,
        orderCount: data.scores.length,
        avgScore: Math.round(data.scores.reduce((a, b) => a + b, 0) / data.scores.length),
        confirmationRate: completed.length > 0 ? delivered / completed.length : 0,
      };
    })
    .sort((a, b) => b.orderCount - a.orderCount)
    .slice(0, 10);

  // ── Top factors ──
  const factorMap = new Map<string, { count: number; pointsSum: number; labelKey: string }>();
  for (const a of assessments) {
    for (const f of a.assessment.factors) {
      const entry = factorMap.get(f.id) ?? { count: 0, pointsSum: 0, labelKey: f.labelKey };
      entry.count++;
      entry.pointsSum += f.points;
      factorMap.set(f.id, entry);
    }
  }
  const topFactors = Array.from(factorMap.entries())
    .map(([factorId, data]) => ({
      factorId,
      labelKey: data.labelKey,
      occurrenceCount: data.count,
      avgPoints: data.count > 0 ? Math.round(data.pointsSum / data.count) : 0,
    }))
    .sort((a, b) => b.occurrenceCount - a.occurrenceCount)
    .slice(0, 8);

  // ── Trend (daily) ──
  const trendMap = new Map<string, { scores: number[]; criticalCount: number }>();
  for (const a of assessments) {
    const dateKey = a.createdAt.toISOString().split("T")[0]!;
    const entry = trendMap.get(dateKey) ?? { scores: [], criticalCount: 0 };
    entry.scores.push(a.assessment.score);
    if (a.assessment.level === "critical") entry.criticalCount++;
    trendMap.set(dateKey, entry);
  }
  const trend = Array.from(trendMap.entries())
    .map(([date, data]) => ({
      date,
      orderCount: data.scores.length,
      avgScore: Math.round(data.scores.reduce((a, b) => a + b, 0) / data.scores.length),
      criticalCount: data.criticalCount,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // ── Rule triggers ──
  const ruleTriggers = rules.map((r) => ({
    ruleId: r.id,
    labelKey: r.labelKey,
    triggerCount: r.triggerCount,
    enabled: r.enabled,
  }));

  // ── KPIs ──
  const allScores = assessments.map((a) => a.assessment.score);
  const avgRiskScore = allScores.length > 0
    ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length)
    : 0;

  const completedOrders = assessments.filter((a) =>
    ["delivered", "returned", "refused"].includes(a.status),
  );
  const deliveredCount = completedOrders.filter((a) => a.status === "delivered").length;
  const returnedCount = completedOrders.filter(
    (a) => a.status === "returned" || a.status === "refused",
  ).length;
  const confirmationRate = completedOrders.length > 0
    ? deliveredCount / completedOrders.length
    : 0;
  const returnRate = completedOrders.length > 0
    ? returnedCount / completedOrders.length
    : 0;

  const highRiskOrderCount = assessments.filter(
    (a) => a.assessment.level === "high" || a.assessment.level === "critical",
  ).length;

  // Potential savings: high-risk orders that were returned × avg delivery cost
  // (conservative estimate: 600 DZD per returned delivery)
  const returnedHighRisk = assessments.filter(
    (a) => (a.assessment.level === "high" || a.assessment.level === "critical")
      && (a.status === "returned" || a.status === "refused"),
  ).length;
  const potentialSavingsDzd = returnedHighRisk * 600;

  const blacklistedCustomerCount = (await db.customer.count({
    where: { isBlacklisted: true, deletedAt: null },
  }));

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
      potentialSavingsDzd,
    },
  };
}
