/**
 * Dashboard data fetcher — runs server-side, calls statsService.
 *
 * In the Tauri app, this runs in the Next.js server context (which is
 * in-process, not a separate server). For the web dev environment,
 * it's a normal server function.
 */
import "server-only";
import { db } from "@/lib/db";
import { statsService } from "@/lib/data/stats-service";

export async function getDashboardStats() {
  return statsService.getDashboard({ prisma: db });
}

export async function getRecentOrders(limit = 5) {
  const orders = await db.order.findMany({
    where: { deletedAt: null },
    take: limit,
    orderBy: { createdAt: "desc" },
    include: {
      items: true,
      customer: { select: { name: true, phone: true } },
    },
  });
  return orders;
}
