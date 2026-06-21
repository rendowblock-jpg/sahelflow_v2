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
      newCustomersToday,
      activeConversations,
      pendingDeliveries,
      lowStockProducts,
    ] = await Promise.all([
      ctx.prisma.order.count({ where: { createdAt: { gte: startOfDay } } }),
      ctx.prisma.order.count({
        where: { createdAt: { gte: startOfYesterday, lt: startOfDay } },
      }),
      ctx.prisma.order.aggregate({
        where: { createdAt: { gte: startOfDay }, status: { not: "cancelled" } },
        _sum: { totalPrice: true },
      }),
      ctx.prisma.customer.count({ where: { createdAt: { gte: startOfDay } } }),
      ctx.prisma.conversation.count({ where: { unreadCount: { gt: 0 } } }),
      ctx.prisma.delivery.count({
        where: { status: { in: ["pending", "created"] } },
      }),
      ctx.prisma.product.count({
        where: { isActive: true, stock: { lte: 5 } },
      }),
    ]);

    const todayRev = revenueToday._sum.totalPrice ?? 0;

    // Calculate trends (avoid division by zero)
    const ordersTrend =
      ordersYesterday === 0 ? 0 : Math.round(((ordersToday - ordersYesterday) / ordersYesterday) * 100);

    return {
      ordersToday,
      ordersTrend,
      revenueToday: todayRev,
      revenueTrend: 0, // TODO: fetch yesterday's revenue for trend
      newCustomers: newCustomersToday,
      activeConversations,
      pendingDeliveries,
      lowStockProducts,
    };
  },
};
