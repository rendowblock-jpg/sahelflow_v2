/**
 * Dashboard data fetchers — server-side desktop business queries.
 */
import "server-only";

import { db, shopContext } from "@/lib/db";
import { statsService } from "@/lib/data/stats-service";
import type { DashboardFieldAccess } from "@/lib/identity/dashboard-projection";

export async function getDashboardStats() {
  return statsService.getDashboard({ prisma: db, shop: shopContext });
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
    orderBy: { createdAt: "desc" },
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
