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
 *
 * Localization: the report content is fully i18n-aware — pass the recipient's
 * preferred Locale to generateDailyReport(). Defaults to "fr" (the business
 * default in Algeria) when no locale is supplied (e.g. cron context).
 */
import "server-only";

import { db } from "@/lib/db";
// Phase 4: canonical gross-revenue formula. Replaces the local
// `status: { not: "cancelled" }` aggregate, which excluded cancelled
// but NOT draft -- diverging from the dashboard (canonical excludes
// both cancelled + draft). Half-open period [startOfYesterday, endOfYesterday+1ms).
import { grossRevenue } from "@/lib/data/metrics";
import { formatDZDBare as formatDZD } from "@/lib/utils";
import type { Locale } from "@/lib/i18n";
import { loadTranslationsSync } from "@/lib/i18n-server";

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
  locale: Locale;
}

/** Locale tag for date formatting. */
const LOCALE_TAG: Record<Locale, string> = {
  ar: "ar-DZ",
  fr: "fr-FR",
  en: "en-GB",
};

/** Format a date with weekday + day + month + year in the given locale. */
function formatDateLocalized(date: Date, locale: Locale): string {
  return date.toLocaleDateString(LOCALE_TAG[locale], {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Build a t() function for the given locale. */
function makeT(locale: Locale) {
  const translations = loadTranslationsSync(locale);
  return (key: string, params?: Record<string, string | number>): string => {
    let value = translations[key] ?? key;
    if (params) {
      for (const [param, val] of Object.entries(params)) {
        value = value.replace(new RegExp(`\\{\\{${param}\\}\\}`, "g"), String(val));
      }
    }
    return value;
  };
}

/**
 * Generate the daily report for yesterday.
 * Returns null if there were no orders yesterday (nothing to report).
 */
export async function generateDailyReport(locale: Locale = "fr"): Promise<DailyReport | null> {
  const t = makeT(locale);
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
    revenue,
    newCustomers,
    topProductItems,
    lowStockProducts,
  ] = await Promise.all([
    db.order.findMany({
      where: { createdAt: { gte: startOfYesterday, lte: endOfYesterday }, deletedAt: null },
      select: { id: true, status: true, totalPrice: true },
    }),
    // Phase 4: canonical gross revenue for yesterday -- excludes
    // cancelled + draft (matches dashboard + analytics). Half-open
    // period [startOfYesterday, endOfYesterday+1ms) matches the
    // inclusive [startOfYesterday, endOfYesterday] window used by the
    // orders query above (endOfYesterday is 23:59:59.999, so +1ms
    // reaches the next midnight without including it).
    grossRevenue(db, { from: startOfYesterday, to: new Date(endOfYesterday.getTime() + 1) }),
    db.customer.count({
      where: { createdAt: { gte: startOfYesterday, lte: endOfYesterday }, deletedAt: null },
    }),
    db.orderItem.findMany({
      where: { order: { createdAt: { gte: startOfYesterday, lte: endOfYesterday }, deletedAt: null } },
      select: { productName: true, quantity: true, total: true },
    }),
    db.product.findMany({
      where: { isActive: true, stock: { lte: db.product.fields.lowStockThreshold }, deletedAt: null },
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
      where: { orderId: { in: orderIds }, deletedAt: null },
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

  // revenue is already a number from grossRevenue (Phase 4 refactor).

  // Build the WhatsApp message (locale-aware, emoji-formatted, WhatsApp-friendly)
  const lines: string[] = [];
  lines.push(`📊 *${t("dailyReport.title")} — ${formatDateLocalized(startOfYesterday, locale)}*`);
  lines.push("");
  lines.push(`🛒 *${t("dailyReport.orders")}:* ${orders.length}`);
  lines.push(`💰 *${t("dailyReport.revenue")}:* ${formatDZD(revenue)} DZD`);
  if (newCustomers > 0) {
    lines.push(`👤 *${t("dailyReport.newCustomers")}:* ${newCustomers}`);
  }
  lines.push("");
  if (deliveredCount > 0 || inTransitCount > 0 || returnedCount > 0) {
    lines.push(`📦 *${t("dailyReport.deliveries")}:*`);
    if (deliveredCount > 0) lines.push(`   ✅ ${t("dailyReport.delivered")}: ${deliveredCount}`);
    if (inTransitCount > 0) lines.push(`   🚚 ${t("dailyReport.inTransit")}: ${inTransitCount}`);
    if (returnedCount > 0) lines.push(`   ↩️ ${t("dailyReport.returned")}: ${returnedCount}`);
    lines.push("");
  }
  if (topProducts.length > 0) {
    lines.push(`🏆 *${t("dailyReport.topProducts")}:*`);
    for (let i = 0; i < topProducts.length; i++) {
      const p = topProducts[i]!;
      lines.push(`   ${i + 1}. ${p.name} (${p.quantity}x — ${formatDZD(p.revenue)} DZD)`);
    }
    lines.push("");
  }
  if (lowStockProducts.length > 0) {
    lines.push(`⚠️ *${t("dailyReport.lowStock")}:*`);
    for (const p of lowStockProducts) {
      lines.push(`   • ${p.name} — ${p.stock} ${t("dailyReport.unitsRemaining")}`);
    }
    lines.push("");
  }
  lines.push(`_${t("dailyReport.generatedBy")}_`);

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
    locale,
  };
}
