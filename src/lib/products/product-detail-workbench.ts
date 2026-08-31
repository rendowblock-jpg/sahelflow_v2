import "server-only";

import { db } from "@/lib/db";
import { trustedActionAllowed } from "@/lib/identity/authorization";
import type { TrustedActorContext } from "@/lib/identity/trusted-actor";
import { getProductWorkbenchDetail } from "./product-workbench";
import { getProductStockHistory } from "./product-stock-history";

function allowed(
  actorContext: TrustedActorContext,
  action: Parameters<typeof trustedActionAllowed>[1],
): boolean {
  return trustedActionAllowed(actorContext, action, {
    shopId: actorContext.shop.shopId,
  });
}

export async function getProductDetailWorkbench(
  actorContext: TrustedActorContext,
  productId: string,
) {
  const product = await getProductWorkbenchDetail(actorContext, productId);
  if (!product) return null;

  const canReadOrders = allowed(actorContext, "orders.read");
  const canReadOrderFinancials =
    canReadOrders && allowed(actorContext, "orders.financials.read");
  // R3-c: stock-adjustment history — audit-trail rows that record explicit
  // stock mutations for this product (no StockEvent model exists yet).
  const stockHistory = await getProductStockHistory(db, productId);
  const recentItems = canReadOrders
    ? await db.orderItem.findMany({
        where: { productId, order: { deletedAt: null } },
        select: {
          id: true,
          quantity: true,
          unitPrice: canReadOrderFinancials,
          total: canReadOrderFinancials,
          order: {
            select: {
              id: true,
              orderNumber: true,
              status: true,
              createdAt: true,
            },
          },
        },
        orderBy: [{ order: { createdAt: "desc" } }, { id: "desc" }],
        take: 20,
      })
    : [];

  return {
    product,
    canReadOrders,
    canReadOrderFinancials,
    stockHistory,
    recentItems: recentItems.map((item) => ({
      id: item.id,
      quantity: item.quantity,
      unitPrice: canReadOrderFinancials ? item.unitPrice : null,
      total: canReadOrderFinancials ? item.total : null,
      order: item.order,
    })),
  };
}
