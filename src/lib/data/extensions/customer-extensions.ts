/**
 * Customer service extensions — search + stats aggregation.
 *
 * These methods give the merchant a 360° view of each customer and
 * enable text search across the customer database (by name or phone).
 */
import "server-only";
import type { ServiceContext } from "../service-base";

export interface CustomerStats {
  totalOrders: number;
  totalSpent: number; // LTV (integer DZD)
  deliveredCount: number;
  returnedCount: number;
  deliveryRate: number; // 0-100
  avgOrderValue: number;
  lastOrderDate: Date | null;
  firstOrderDate: Date | null;
}

export interface CustomerListItem {
  id: string;
  name: string;
  phone: string;
  phone2: string | null;
  wilaya: string | null;
  commune: string | null;
  address: string | null;
  orderCount: number;
  totalSpent: number;
  riskScore: number;
  createdAt: Date;
}

export const customerServiceExtensions = {
  /**
   * Search customers by name or phone (case-insensitive, partial match).
   * Returns enriched list with order count + total spent + risk score.
   */
  async search(
    ctx: ServiceContext,
    query: string,
    opts?: { limit?: number; offset?: number },
  ): Promise<CustomerListItem[]> {
    const q = query.trim();
    if (!q) return [];

    // SQLite LIKE is case-insensitive for ASCII; for Arabic we rely on
    // the PII blind-index for phone (exact) + LIKE for name (partial).
    const rows = await ctx.prisma.customer.findMany({
      where: {
        OR: [
          { name: { contains: q } },
          { phone: { contains: q } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: opts?.limit ?? 50,
      skip: opts?.offset ?? 0,
      select: {
        id: true,
        name: true,
        phone: true,
        phone2: true,
        wilaya: true,
        commune: true,
        address: true,
        orderCount: true,
        totalSpent: true,
        riskScore: true,
        createdAt: true,
      },
    });
    return rows as unknown as CustomerListItem[];
  },

  /**
   * Get aggregated stats for a single customer — the Customer 360 view.
   * Computes LTV, delivery rate, avg order value, last/first order dates.
   */
  async getStats(ctx: ServiceContext, customerId: string): Promise<CustomerStats> {
    const orders = await ctx.prisma.order.findMany({
      where: { customerId },
      select: {
        status: true,
        totalPrice: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    const totalOrders = orders.length;
    const totalSpent = orders
      .filter((o) => !["cancelled", "draft"].includes(o.status))
      .reduce((sum, o) => sum + o.totalPrice, 0);
    const deliveredCount = orders.filter((o) => o.status === "delivered").length;
    const returnedCount = orders.filter(
      (o) => o.status === "returned" || o.status === "refused",
    ).length;
    const deliveryRate = totalOrders > 0 ? Math.round((deliveredCount / totalOrders) * 100) : 0;
    const avgOrderValue = totalOrders > 0 ? Math.round(totalSpent / totalOrders) : 0;
    const lastOrderDate = totalOrders > 0 ? orders[orders.length - 1]!.createdAt : null;
    const firstOrderDate = totalOrders > 0 ? orders[0]!.createdAt : null;

    return {
      totalOrders,
      totalSpent,
      deliveredCount,
      returnedCount,
      deliveryRate,
      avgOrderValue,
      lastOrderDate,
      firstOrderDate,
    };
  },

  /**
   * Get a customer's order history (paginated, newest first).
   */
  async getOrderHistory(
    ctx: ServiceContext,
    customerId: string,
    opts?: { limit?: number; offset?: number },
  ) {
    return ctx.prisma.order.findMany({
      where: { customerId },
      include: { items: true },
      orderBy: { createdAt: "desc" },
      take: opts?.limit ?? 20,
      skip: opts?.offset ?? 0,
    });
  },
};
