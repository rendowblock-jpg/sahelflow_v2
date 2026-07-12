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

/** Format a date with weekday + day + month + year in the given locale.
 *  W2-9 (TZ fix): the date is rendered in the Africa/Algiers timezone so the
 *  displayed calendar date matches the report's Algiers-local date range
 *  (regardless of the server's local TZ). Without this, a UTC-server would
 *  display "10 juillet" for the Algiers-midnight UTC instant 2026-07-10T23:00Z
 *  (which is "11 juillet" in Algiers). */
function formatDateLocalized(date: Date, locale: Locale): string {
  return date.toLocaleDateString(LOCALE_TAG[locale], {
    timeZone: "Africa/Algiers",
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
 * Compute yesterday's date range in the Africa/Algiers timezone.
 *
 * Returns UTC Date objects representing [startOfYesterdayAlgiers,
 * endOfYesterdayAlgiers] where end is exclusive (startOfTodayAlgiers).
 * The range covers 24 hours of Algerian local time.
 *
 * Uses `Intl.DateTimeFormat` with `en-CA` (which produces ISO-8601
 * "YYYY-MM-DD") to get the Algiers-local calendar date, then constructs
 * UTC Date objects at the corresponding UTC instants (Algiers is UTC+1,
 * so Algiers-midnight = previous-day-23:00 UTC).
 */
function getAlgiersYesterdayRange(d: Date = new Date()): { start: Date; end: Date } {
  const algiersFmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Algiers",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const todayStr = algiersFmt.format(d); // "YYYY-MM-DD" in Algiers
  // Construct the UTC instant for "midnight Algiers on today's date" using
  // an ISO-8601 string with explicit +01:00 offset. This correctly accounts
  // for the UTC+1 offset (Algiers has had no DST since 1981, but using the
  // explicit offset is more robust than hardcoding `-1 hour` and is also
  // self-documenting).
  //   todayStr = "2026-07-12" → "2026-07-12T00:00:00+01:00"
  //            → UTC instant 2026-07-11T23:00:00Z (= start of today in Algiers)
  const startTodayAlgiersUtc = new Date(`${todayStr}T00:00:00+01:00`);
  const startYesterdayAlgiersUtc = new Date(startTodayAlgiersUtc.getTime() - 24 * 60 * 60 * 1000);
  // end = startOfTodayAlgiers (exclusive upper bound)
  return { start: startYesterdayAlgiersUtc, end: startTodayAlgiersUtc };
}

/**
 * Generate the daily report for yesterday.
 * Returns null if there were no orders yesterday (nothing to report).
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
    revenue,
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
    // Phase 4: canonical gross revenue for yesterday -- excludes
    // cancelled + draft (matches dashboard + analytics). Half-open
    // period [startOfYesterday, endOfYesterday) now matches the orders
    // query above (W2-9 TZ fix).
    grossRevenue(db, { from: startOfYesterday, to: endOfYesterday }),
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
