/**
 * Daily report generator — summarizes the previous day's activity and formats
 * it as a WhatsApp message.
 *
 * The report covers yesterday using the half-open local interval [00:00, next 00:00) and includes:
 *   - Orders created yesterday + realized delivery revenue earned yesterday
 *   - Delivery status summary (delivered / in-transit / returned)
 *   - Top 3 products by quantity sold
 *   - Low stock alerts (≤ threshold)
 *   - New customers
 *
 * If there was no order or governed financial activity yesterday, the report is skipped (returns null).
 * The cron route uses this to decide whether to send.
 *
 * Localization: the report content is fully i18n-aware — pass the recipient's
 * preferred Locale to generateDailyReport(). Defaults to "fr" (the business
 * default in Algeria) when no locale is supplied (e.g. cron context).
 */
import "server-only";

import { db } from "@/lib/db";
import { getProfitabilityProjection } from "@/lib/accounting/profitability";
import { formatDZDBare as formatDZD } from "@/lib/utils";
import type { Locale } from "@/lib/i18n";
import { loadTranslationsSync } from "@/lib/i18n-server";
import { getRuntimeTranslation } from "@/lib/i18n/runtime-translations";
import { moneyNameKey } from "@/lib/analytics/money-names";
import { intlLocale } from "@/lib/utils";
import { addShopDays, SHOP_TIME_ZONE, startOfShopDay } from "@/lib/time/shop-day";

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

// Locale tags come from the one authority, `intlLocale` in src/lib/utils.ts.
// The private map this module kept resolved French to `fr-FR` against the
// canonical `fr-DZ`.

/** Format a date with weekday + day + month + year in the given locale.
 *  W2-9 (TZ fix): the date is rendered in the Africa/Algiers timezone so the
 *  displayed calendar date matches the report's Algiers-local date range
 *  (regardless of the server's local TZ). Without this, a UTC-server would
 *  display "10 juillet" for the Algiers-midnight UTC instant 2026-07-10T23:00Z
 *  (which is "11 juillet" in Algiers). */
function formatDateLocalized(date: Date, locale: Locale): string {
  return date.toLocaleDateString(intlLocale(locale), {
    timeZone: SHOP_TIME_ZONE,
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
    let value = translations[key] ?? getRuntimeTranslation(locale, key) ?? key;
    if (params) {
      for (const [param, val] of Object.entries(params)) {
        value = value.replace(new RegExp(`\\{\\{${param}\\}\\}`, "g"), String(val));
      }
    }
    return value;
  };
}

/**
 * Yesterday's range in shop time (Africa/Algiers): [start, end) where end is
 * the start of today. Algiers is UTC+1, so Algiers-midnight is 23:00 UTC of
 * the day before; the edges come from the shared shop-day helper.
 */
function getAlgiersYesterdayRange(d: Date = new Date()): { start: Date; end: Date } {
  const end = startOfShopDay(d);
  return { start: addShopDays(end, -1), end };
}

/**
 * Generate the daily report for yesterday.
 * Returns null when yesterday has no operational or governed financial activity.
 */
export async function generateDailyReport(locale: Locale = "fr"): Promise<DailyReport | null> {
  const t = makeT(locale);
  // W2-9 (TZ fix): compute "yesterday" in Africa/Algiers, NOT the server's
  // local timezone. The cron may run on a server in UTC/Europe, but the
  // seller's business day is defined by Algerian local time. Without this,
  // a UTC-server cron firing at 23:30 UTC would report "yesterday UTC"
  // (which is "today" in Algiers until 23:00 UTC) — under-counting the
  // day's orders by ~1 hour.
  const { start: startOfYesterday, end: endOfYesterday } = getAlgiersYesterdayRange();

  // Fetch all the data in parallel
  const [
    orders,
    profitability,
    newCustomers,
    topProductItems,
    lowStockProducts,
  ] = await Promise.all([
    db.order.findMany({
      // W2-9: half-open [startOfYesterday, endOfYesterday) — end is now
      // exclusive (startOfTodayAlgiers) instead of inclusive (23:59:59.999).
      where: { createdAt: { gte: startOfYesterday, lt: endOfYesterday }, deletedAt: null },
      select: { id: true, status: true, totalPrice: true },
    }),
    getProfitabilityProjection(db, {
      from: startOfYesterday,
      to: endOfYesterday,
    }),
    db.customer.count({
      where: { createdAt: { gte: startOfYesterday, lt: endOfYesterday }, deletedAt: null },
    }),
    db.orderItem.findMany({
      where: { order: { createdAt: { gte: startOfYesterday, lt: endOfYesterday }, deletedAt: null } },
      select: { productName: true, quantity: true, total: true },
    }),
    db.product.findMany({
      where: { isActive: true, stock: { lte: db.product.fields.lowStockThreshold }, deletedAt: null },
      select: { name: true, stock: true },
      orderBy: { stock: "asc" },
      take: 5,
    }),
  ]);

  if (
    orders.length === 0 &&
    profitability.grossRevenue === 0 &&
    profitability.refunds === 0 &&
    profitability.netProfit === 0
  ) {
    return null;
  }

  const revenue = profitability.grossRevenue;

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

  // Build the WhatsApp message (locale-aware, emoji-formatted, WhatsApp-friendly)
  const lines: string[] = [];
  lines.push(`📊 *${t("dailyReport.title")} — ${formatDateLocalized(startOfYesterday, locale)}*`);
  lines.push("");
  lines.push(`🛒 *${t("dailyReport.orders")}:* ${orders.length}`);
  // The figure is the delivered revenue before refunds (grossRevenue of the
  // profitability projection), so it carries that name, not the bare word.
  lines.push(`💰 *${t(moneyNameKey("revenueDelivered"))}:* ${formatDZD(revenue)} DZD`);
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
