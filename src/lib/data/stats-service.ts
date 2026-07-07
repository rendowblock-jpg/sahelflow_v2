/**
 * Stats service — aggregated metrics for the dashboard.
 */
import type { DashboardStats } from "@/types/domain";
import type { ServiceContext } from "./service-base";

export const statsService = {
  async getDashboard(ctx: ServiceContext): Promise<DashboardStats> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const startOfYesterday = new Date(startOfDay);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);

    const [
      ordersToday,
      ordersYesterday,
      revenueToday,
      revenueYesterday,
      realizedRevenueTodayAgg,
      realizedRevenueYesterdayAgg,
      newCustomersToday,
      activeConversations,
      pendingDeliveries,
      lowStockProducts,
    ] = await Promise.all([
      ctx.prisma.order.count({ where: { createdAt: { gte: startOfDay }, deletedAt: null } }),
      ctx.prisma.order.count({
        where: { createdAt: { gte: startOfYesterday, lt: startOfDay }, deletedAt: null },
      }),
      // Gross Revenue = all non-cancelled orders (what was ordered)
      ctx.prisma.order.aggregate({
        where: { createdAt: { gte: startOfDay }, status: { not: "cancelled" }, deletedAt: null },
        _sum: { totalPrice: true },
      }),
      ctx.prisma.order.aggregate({
        where: {
          createdAt: { gte: startOfYesterday, lt: startOfDay },
          status: { not: "cancelled" },
          deletedAt: null,
        },
        _sum: { totalPrice: true },
      }),
      // Realized Revenue = delivered orders only (what was actually collected).
      // SV-M10: filter by deliveredAt (not createdAt) so an order created
      // yesterday + delivered today shows up in TODAY's realized revenue,
      // not yesterday's. createdAt is when the order was placed; deliveredAt
      // is when the cash was actually collected — the latter is what "realized"
      // means. (deliveredAt is set on the shipped→delivered transition in
      // orderService.updateStatus.) Only count orders where deliveredAt is
      // non-null + in the date window (the status:"delivered" filter is
      // kept as defense-in-depth in case deliveredAt is somehow null on a
      // delivered order — shouldn't happen, but the cost is one extra filter).
      ctx.prisma.order.aggregate({
        where: {
          deliveredAt: { gte: startOfDay },
          status: "delivered",
          deletedAt: null,
        },
        _sum: { totalPrice: true },
      }),
      ctx.prisma.order.aggregate({
        where: {
          deliveredAt: { gte: startOfYesterday, lt: startOfDay },
          status: "delivered",
          deletedAt: null,
        },
        _sum: { totalPrice: true },
      }),
      ctx.prisma.customer.count({ where: { createdAt: { gte: startOfDay }, deletedAt: null } }),
      ctx.prisma.conversation.count({ where: { unreadCount: { gt: 0 } } }),
      ctx.prisma.delivery.count({
        where: { status: { in: ["pending", "created"] }, deletedAt: null },
      }),
      ctx.prisma.product.count({
        where: { isActive: true, stock: { lte: ctx.prisma.product.fields.lowStockThreshold }, deletedAt: null },
      }),
    ]);

    const todayRev = revenueToday._sum.totalPrice ?? 0;
    const yesterdayRev = revenueYesterday._sum.totalPrice ?? 0;
    const todayRealized = realizedRevenueTodayAgg._sum.totalPrice ?? 0;
    const yesterdayRealized = realizedRevenueYesterdayAgg._sum.totalPrice ?? 0;

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
