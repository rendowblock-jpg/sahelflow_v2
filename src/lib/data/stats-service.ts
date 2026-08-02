/**
 * Stats service — aggregated metrics for the dashboard.
 *
 * Phase 4: revenue figures (gross + realized) now delegate to the
 * canonical `metrics.ts` module. Previously this service defined its
 * own revenue formula (`status: { not: "cancelled" }` — which excluded
 * cancelled but NOT draft, diverging from the analytics-page formula
 * that excluded both cancelled + draft). The canonical definition
 * (DATA_INTEGRITY_PLAN.md Phase 4) excludes both cancelled + draft.
 */
import type { DashboardStats } from "@/types/domain";
import type { ServiceContext } from "./service-base";
import { grossRevenue } from "./metrics";
import { getProfitabilitySeries } from "@/lib/accounting/profitability";

export const statsService = {
  async getDashboard(ctx: ServiceContext): Promise<DashboardStats> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const startOfYesterday = new Date(startOfDay);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);

    const startOfTomorrow = new Date(startOfDay);
    startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

    // Half-open periods: today = [startOfDay, startOfTomorrow);
    // yesterday = [startOfYesterday, startOfDay). These chain cleanly
    // (yesterday.to === today.from) so an order placed at exactly
    // midnight belongs to exactly one period, never both.
    const todayPeriod = { from: startOfDay, to: startOfTomorrow };
    const yesterdayPeriod = { from: startOfYesterday, to: startOfDay };

    const [
      ordersToday,
      ordersYesterday,
      revenueToday,
      revenueYesterday,
      profitabilityPeriods,
      newCustomersToday,
      activeConversations,
      pendingDeliveries,
      lowStockProducts,
    ] = await Promise.all([
      ctx.prisma.order.count({ where: { createdAt: { gte: startOfDay }, deletedAt: null } }),
      ctx.prisma.order.count({
        where: { createdAt: { gte: startOfYesterday, lt: startOfDay }, deletedAt: null },
      }),
      // Gross Revenue (today) — canonical: status NOT IN [cancelled, draft].
      grossRevenue(ctx.prisma, todayPeriod),
      grossRevenue(ctx.prisma, yesterdayPeriod),
      getProfitabilitySeries(ctx.prisma, [
        { key: "today", period: todayPeriod },
        { key: "yesterday", period: yesterdayPeriod },
      ]),
      ctx.prisma.customer.count({ where: { createdAt: { gte: startOfDay }, deletedAt: null } }),
      ctx.prisma.conversation.count({ where: { unreadCount: { gt: 0 } } }),
      ctx.prisma.delivery.count({
        where: { status: { in: ["pending", "created"] }, deletedAt: null },
      }),
      ctx.prisma.product.count({
        where: { isActive: true, stock: { lte: ctx.prisma.product.fields.lowStockThreshold }, deletedAt: null },
      }),
    ]);

    const profitabilityByKey = new Map(
      profitabilityPeriods.map((entry) => [entry.key, entry.projection]),
    );
    const todayProfitability = profitabilityByKey.get("today");
    const yesterdayProfitability = profitabilityByKey.get("yesterday");
    if (!todayProfitability || !yesterdayProfitability) {
      throw new Error("Dashboard profitability periods were not projected");
    }

    const todayRev = revenueToday;
    const yesterdayRev = revenueYesterday;
    const todayRealized = todayProfitability.grossRevenue;
    const yesterdayRealized = yesterdayProfitability.grossRevenue;

    // Calculate trends (avoid division by zero)
    const ordersTrend =
      ordersYesterday === 0 ? 0 : Math.round(((ordersToday - ordersYesterday) / ordersYesterday) * 100);

    const revenueTrend =
      yesterdayRev === 0 ? 0 : Math.round(((todayRev - yesterdayRev) / yesterdayRev) * 100);

    const realizedRevenueTrend =
      yesterdayRealized === 0 ? 0 : Math.round(((todayRealized - yesterdayRealized) / yesterdayRealized) * 100);

    return {
      ordersToday,
      ordersTrend,
      revenueToday: todayRev,
      revenueTrend,
      realizedRevenueToday: todayRealized,
      realizedRevenueTrend,
      newCustomers: newCustomersToday,
      activeConversations,
      pendingDeliveries,
      lowStockProducts,
    };
  },
};
