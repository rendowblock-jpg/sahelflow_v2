import "server-only";

import { db } from "@/lib/db";
import { trustedActionAllowed } from "@/lib/identity/authorization";
import type { TrustedActorContext } from "@/lib/identity/trusted-actor";
import { getCustomerWorkbenchDetail } from "./customer-workbench";

function allowed(
  actorContext: TrustedActorContext,
  action: Parameters<typeof trustedActionAllowed>[1],
): boolean {
  return trustedActionAllowed(actorContext, action, {
    shopId: actorContext.shop.shopId,
  });
}

export async function getCustomerDetailWorkbench(
  actorContext: TrustedActorContext,
  customerId: string,
) {
  const customer = await getCustomerWorkbenchDetail(actorContext, customerId);
  if (!customer) return null;

  const canReadOrders = allowed(actorContext, "orders.read");
  const canReadOrderFinancials =
    canReadOrders && allowed(actorContext, "orders.financials.read");
  if (!canReadOrders) {
    return {
      customer,
      canReadOrders,
      canReadOrderFinancials,
      stats: null,
      orders: [],
    };
  }

  const [statusGroups, dates, financial, orders] = await Promise.all([
    db.order.groupBy({
      by: ["status"],
      where: { customerId, deletedAt: null },
      _count: { _all: true },
    }),
    db.order.aggregate({
      where: { customerId, deletedAt: null },
      _min: { createdAt: true },
      _max: { createdAt: true },
    }),
    canReadOrderFinancials
      ? db.order.aggregate({
          where: {
            customerId,
            deletedAt: null,
            status: { notIn: ["cancelled", "draft"] },
          },
          _sum: { totalPrice: true },
        })
      : Promise.resolve(null),
    db.order.findMany({
      where: { customerId, deletedAt: null },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        totalPrice: canReadOrderFinancials,
        createdAt: true,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 50,
    }),
  ]);

  const counts = new Map(
    statusGroups.map((group) => [group.status, group._count._all]),
  );
  const totalOrders = statusGroups.reduce(
    (sum, group) => sum + group._count._all,
    0,
  );
  const deliveredCount = counts.get("delivered") ?? 0;
  const returnedCount =
    (counts.get("returned") ?? 0) + (counts.get("refused") ?? 0);
  const totalSpent = canReadOrderFinancials
    ? (financial?._sum.totalPrice ?? 0)
    : null;

  return {
    customer,
    canReadOrders,
    canReadOrderFinancials,
    stats: {
      totalOrders,
      totalSpent,
      deliveredCount,
      returnedCount,
      deliveryRate:
        totalOrders > 0 ? Math.round((deliveredCount / totalOrders) * 100) : 0,
      avgOrderValue:
        totalSpent !== null && totalOrders > 0
          ? Math.round(totalSpent / totalOrders)
          : null,
      firstOrderDate: dates._min.createdAt,
      lastOrderDate: dates._max.createdAt,
    },
    orders: orders.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      totalPrice: canReadOrderFinancials ? order.totalPrice : null,
      createdAt: order.createdAt,
    })),
  };
}
