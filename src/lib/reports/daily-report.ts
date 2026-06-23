/**
 * Daily report generator — summarizes the previous day's activity and formats
 * it as a WhatsApp message.
 *
 * The report covers yesterday (00:00 → 23:59 local time) and includes:
 *   - Orders: count + revenue (excluding cancelled)
 *   - Delivery status summary (delivered / in-transit / returned)
 *   - Top 3 products by quantity sold
 *   - Low stock alerts (≤ threshold)
 *   - New customers
 *
 * If no orders were placed yesterday, the report is skipped (returns null).
 * The cron route uses this to decide whether to send.
 */
import "server-only";


import { db } from "@/lib/db";
import { formatDZDBare as formatDZD } from "@/lib/utils";

export interface DailyReport {
  date: Date; // the day being reported (yesterday)
  ordersCount: number;
  revenue: number;
  deliveredCount: number;
  inTransitCount: number;
  returnedCount: number;
  topProducts: Array<{ name: string; quantity: number; revenue: number }>;
  lowStockProducts: Array<{ name: string; stock: number }>;
  newCustomers: number;
  message: string; // formatted WhatsApp message
}

/** Format a DZD amount with thousands separators. */
// Currency formatting uses formatDZDBare from utils.ts (Z-013: was a
// local formatDZD that returned just the number, inconsistent with the
// "DA" suffix used elsewhere. Now uses the canonical bare formatter.)

/** Format a date as "lun. 21 juin 2026" (French, short). */
function formatDateFR(date: Date): string {
  return date.toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Generate the daily report for yesterday.
 * Returns null if there were no orders yesterday (nothing to report).
 */
export async function generateDailyReport(): Promise<DailyReport | null> {
  // yesterday (local midnight boundaries)
  const now = new Date();
  const startOfYesterday = new Date(now);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  startOfYesterday.setHours(0, 0, 0, 0);
  const endOfYesterday = new Date(startOfYesterday);
  endOfYesterday.setHours(23, 59, 59, 999);

  // Fetch all the data in parallel
  const [
    orders,
    revenueAgg,
    newCustomers,
    topProductItems,
    lowStockProducts,
  ] = await Promise.all([
    db.order.findMany({
      where: { createdAt: { gte: startOfYesterday, lte: endOfYesterday } },
      select: { id: true, status: true, totalPrice: true },
    }),
    db.order.aggregate({
      where: {
        createdAt: { gte: startOfYesterday, lte: endOfYesterday },
        status: { not: "cancelled" },
      },
      _sum: { totalPrice: true },
    }),
    db.customer.count({
      where: { createdAt: { gte: startOfYesterday, lte: endOfYesterday } },
    }),
    db.orderItem.findMany({
      where: { order: { createdAt: { gte: startOfYesterday, lte: endOfYesterday } } },
      select: { productName: true, quantity: true, total: true },
    }),
    db.product.findMany({
      where: { isActive: true, stock: { lte: db.product.fields.lowStockThreshold } },
      select: { name: true, stock: true },
      orderBy: { stock: "asc" },
      take: 5,
    }),
  ]);

  if (orders.length === 0) {
    return null; // nothing to report
  }

  // Delivery status (fetch deliveries for yesterday's orders)
  const orderIds = orders.map((o) => o.id);
  let deliveredCount = 0;
  let inTransitCount = 0;
  let returnedCount = 0;
  if (orderIds.length > 0) {
    const deliveries = await db.delivery.findMany({
      where: { orderId: { in: orderIds } },
      select: { status: true },
    });
    for (const d of deliveries) {
      if (d.status === "delivered") deliveredCount++;
      else if (d.status === "returned" || d.status === "refused" || d.status === "failed") returnedCount++;
      else inTransitCount++; // pending, created, picked_up, in_transit, at_hub, out_for_delivery
    }
  }

  // Aggregate top products by quantity
  const productMap = new Map<string, { quantity: number; revenue: number }>();
  for (const item of topProductItems) {
    const existing = productMap.get(item.productName) ?? { quantity: 0, revenue: 0 };
    existing.quantity += item.quantity;
    existing.revenue += item.total;
    productMap.set(item.productName, existing);
  }
  const topProducts = Array.from(productMap.entries())
    .map(([name, stats]) => ({ name, ...stats }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 3);

  const revenue = revenueAgg._sum.totalPrice ?? 0;

  // Build the WhatsApp message (French, emoji-formatted, WhatsApp-friendly)
  const lines: string[] = [];
  lines.push(`📊 *Rapport quotidien — ${formatDateFR(startOfYesterday)}*`);
  lines.push("");
  lines.push(`🛒 *Commandes:* ${orders.length}`);
  lines.push(`💰 *Chiffre d'affaires:* ${formatDZD(revenue)} DZD`);
  if (newCustomers > 0) {
    lines.push(`👤 *Nouveaux clients:* ${newCustomers}`);
  }
  lines.push("");
  if (deliveredCount > 0 || inTransitCount > 0 || returnedCount > 0) {
    lines.push("📦 *Livraisons:*");
    if (deliveredCount > 0) lines.push(`   ✅ Livrées: ${deliveredCount}`);
    if (inTransitCount > 0) lines.push(`   🚚 En cours: ${inTransitCount}`);
    if (returnedCount > 0) lines.push(`   ↩️ Retournées: ${returnedCount}`);
    lines.push("");
  }
  if (topProducts.length > 0) {
    lines.push("🏆 *Top produits:*");
    for (let i = 0; i < topProducts.length; i++) {
      const p = topProducts[i]!;
      lines.push(`   ${i + 1}. ${p.name} (${p.quantity}x — ${formatDZD(p.revenue)} DZD)`);
    }
    lines.push("");
  }
  if (lowStockProducts.length > 0) {
    lines.push("⚠️ *Stock faible:*");
    for (const p of lowStockProducts) {
      lines.push(`   • ${p.name} — ${p.stock} restant(s)`);
    }
    lines.push("");
  }
  lines.push("_Généré par SahelFlow_");

  return {
    date: startOfYesterday,
    ordersCount: orders.length,
    revenue,
    deliveredCount,
    inTransitCount,
    returnedCount,
    topProducts,
    lowStockProducts,
    newCustomers,
    message: lines.join("\n"),
  };
}
