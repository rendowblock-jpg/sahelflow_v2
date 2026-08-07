/**
 * Dashboard data fetchers — server-side desktop business queries.
 */
import "server-only";

import { db, shopContext } from "@/lib/db";
import { statsService } from "@/lib/data/stats-service";
import type { DashboardFieldAccess } from "@/lib/identity/dashboard-projection";

/**
 * Dashboard aggregates are permission-aware before query execution. Omitting
 * fieldAccess preserves the historical full-authority service behavior for
 * internal callers that already enforce their own trusted boundary.
 */
export async function getDashboardStats(fieldAccess?: DashboardFieldAccess) {
  return statsService.getDashboard(
    { prisma: db, shop: shopContext },
    fieldAccess
      ? {
          orders: fieldAccess.orders,
          financials: fieldAccess.analyticsFinancials,
          customers: fieldAccess.customers,
          conversations: fieldAccess.conversations,
          deliveries: fieldAccess.deliveries,
          products: fieldAccess.products,
        }
      : undefined,
  );
}

/**
 * Read only the dashboard order fields the trusted actor may actually see.
 * Contact fields are not opened merely to redact them after the query.
 */
export async function getRecentOrders(
  limit = 5,
  fieldAccess?: Pick<DashboardFieldAccess, "customerContact" | "orderFinancials">,
) {
  const contact = fieldAccess?.customerContact ?? true;
  const financials = fieldAccess?.orderFinancials ?? true;

  return db.order.findMany({
    where: { deletedAt: null },
    take: limit,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      orderNumber: true,
      status: true,
      totalPrice: financials,
      wilaya: contact,
      items: { select: { id: true } },
      customer: contact ? { select: { name: true } } : false,
    },
  });
}
