/**
 * Customer service extensions — search + stats aggregation.
 */
import "server-only";
import type { ServiceContext } from "../service-base";
import { deriveBlindIndex } from "@/lib/crypto/field-crypto";
import { getMasterKey } from "@/lib/crypto/master-key";
import { deriveExistingShopBlindIndex } from "@/lib/crypto/protected-record";

export interface CustomerStats {
  totalOrders: number;
  totalSpent: number;
  deliveredCount: number;
  returnedCount: number;
  deliveryRate: number;
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

type BlindIndexClient = Parameters<typeof deriveExistingShopBlindIndex>[0];

async function searchableIndexes(
  ctx: ServiceContext,
  value: string,
  field: "name" | "phone",
): Promise<string[]> {
  const legacy = deriveBlindIndex(value, getMasterKey());
  const canonical = await deriveExistingShopBlindIndex(
    ctx.prisma as unknown as BlindIndexClient,
    value,
    { recordType: "Customer", field },
    ctx.shop ? { shopContext: ctx.shop } : {},
  );
  return [...new Set([legacy, ...(canonical ? [canonical] : [])])];
}

export const customerServiceExtensions = {
  async search(
    ctx: ServiceContext,
    query: string,
    opts?: { limit?: number; offset?: number },
  ): Promise<CustomerListItem[]> {
    const q = query.trim();
    if (!q) return [];

    const [phoneIndexes, nameIndexes] = await Promise.all([
      searchableIndexes(ctx, q, "phone"),
      searchableIndexes(ctx, q.toLowerCase(), "name"),
    ]);
    const plaintextFallback = process.env.NODE_ENV === "test";

    const rows = await ctx.prisma.customer.findMany({
      where: {
        deletedAt: null,
        OR: [
          { nameBlindIndex: { in: nameIndexes } },
          { phone: { in: phoneIndexes } },
          ...(plaintextFallback
            ? [
                { name: { contains: q } },
                { phone: { contains: q } },
              ]
            : []),
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

  async getStats(ctx: ServiceContext, customerId: string): Promise<CustomerStats> {
    const orders = await ctx.prisma.order.findMany({
      where: { customerId, deletedAt: null },
      select: {
        status: true,
        totalPrice: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    const totalOrders = orders.length;
    const totalSpent = orders
      .filter((order) => !["cancelled", "draft"].includes(order.status))
      .reduce((sum, order) => sum + order.totalPrice, 0);
    const deliveredCount = orders.filter(
      (order) => order.status === "delivered",
    ).length;
    const returnedCount = orders.filter(
      (order) => order.status === "returned" || order.status === "refused",
    ).length;
    const deliveryRate =
      totalOrders > 0 ? Math.round((deliveredCount / totalOrders) * 100) : 0;
    const avgOrderValue =
      totalOrders > 0 ? Math.round(totalSpent / totalOrders) : 0;

    return {
      totalOrders,
      totalSpent,
      deliveredCount,
      returnedCount,
      deliveryRate,
      avgOrderValue,
      lastOrderDate:
        totalOrders > 0 ? orders[orders.length - 1]!.createdAt : null,
      firstOrderDate: totalOrders > 0 ? orders[0]!.createdAt : null,
    };
  },

  async getOrderHistory(
    ctx: ServiceContext,
    customerId: string,
    opts?: { limit?: number; offset?: number },
  ) {
    return ctx.prisma.order.findMany({
      where: { customerId, deletedAt: null },
      include: { items: true },
      orderBy: { createdAt: "desc" },
      take: opts?.limit ?? 20,
      skip: opts?.offset ?? 0,
    });
  },
};
