/**
 * Stats service — aggregated metrics for the dashboard.
 *
 * Phase 4 revenue figures (gross + realized) delegate to canonical metric and
 * profitability authorities. Phase 5 additionally allows the caller to suppress
 * entire metric domains before query execution, so permission projection is
 * defense-in-depth rather than a way to hide already-read protected facts.
 */
import type { DashboardStats } from "@/types/domain";
import type { ServiceContext } from "./service-base";
import { grossRevenue } from "./metrics";
import { getProfitabilitySeries } from "@/lib/accounting/profitability";

export interface DashboardStatsAccess {
  orders?: boolean;
  financials?: boolean;
  customers?: boolean;
  conversations?: boolean;
  deliveries?: boolean;
  products?: boolean;
}

export const statsService = {
  async getDashboard(
    ctx: ServiceContext,
    access: DashboardStatsAccess = {},
  ): Promise<DashboardStats> {
    const canReadOrders = access.orders ?? true;
    const canReadFinancials = access.financials ?? true;
    const canReadCustomers = access.customers ?? true;
    const canReadConversations = access.conversations ?? true;
    const canReadDeliveries = access.deliveries ?? true;
    const canReadProducts = access.products ?? true;

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const startOfYesterday = new Date(startOfDay);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);

    const startOfTomorrow = new Date(startOfDay);
    startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

    // Half-open periods: today = [startOfDay, startOfTomorrow);
    // yesterday = [startOfYesterday, startOfDay).
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
      canReadOrders
        ? ctx.prisma.order.count({
            where: { createdAt: { gte: startOfDay }, deletedAt: null },
          })
        : Promise.resolve(0),
      canReadOrders
        ? ctx.prisma.order.count({
            where: {
              createdAt: { gte: startOfYesterday, lt: startOfDay },
              deletedAt: null,
            },
          })
        : Promise.resolve(0),
      canReadFinancials
        ? grossRevenue(ctx.prisma, todayPeriod)
        : Promise.resolve(0),
      canReadFinancials
        ? grossRevenue(ctx.prisma, yesterdayPeriod)
        : Promise.resolve(0),
      canReadFinancials
        ? getProfitabilitySeries(ctx.prisma, [
            { key: "today", period: todayPeriod },
            { key: "yesterday", period: yesterdayPeriod },
          ])
        : Promise.resolve([]),
      canReadCustomers
        ? ctx.prisma.customer.count({
            where: { createdAt: { gte: startOfDay }, deletedAt: null },
          })
        : Promise.resolve(0),
      canReadConversations
        ? ctx.prisma.conversation.count({ where: { unreadCount: { gt: 0 } } })
        : Promise.resolve(0),
      canReadDeliveries
        ? ctx.prisma.delivery.count({
            where: {
              status: { in: ["pending", "created"] },
              deletedAt: null,
            },
          })
        : Promise.resolve(0),
      canReadProducts
        ? ctx.prisma.product.count({
            where: {
              isActive: true,
              stock: { lte: ctx.prisma.product.fields.lowStockThreshold },
              deletedAt: null,
            },
          })
        : Promise.resolve(0),
    ]);

    let todayRealized = 0;
    let yesterdayRealized = 0;
    if (canReadFinancials) {
      const profitabilityByKey = new Map(
        profitabilityPeriods.map((entry) => [entry.key, entry.projection]),
      );
      const todayProfitability = profitabilityByKey.get("today");
      const yesterdayProfitability = profitabilityByKey.get("yesterday");
      if (!todayProfitability || !yesterdayProfitability) {
        throw new Error("Dashboard profitability periods were not projected");
      }
      todayRealized = todayProfitability.grossRevenue;
      yesterdayRealized = yesterdayProfitability.grossRevenue;
    }

    const ordersTrend =
      ordersYesterday === 0
        ? 0
        : Math.round(((ordersToday - ordersYesterday) / ordersYesterday) * 100);
    const revenueTrend =
      revenueYesterday === 0
        ? 0
        : Math.round(((revenueToday - revenueYesterday) / revenueYesterday) * 100);
    const realizedRevenueTrend =
      yesterdayRealized === 0
        ? 0
        : Math.round(
            ((todayRealized - yesterdayRealized) / yesterdayRealized) * 100,
          );

    return {
      ordersToday,
      ordersTrend,
      revenueToday,
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
