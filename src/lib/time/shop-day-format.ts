import { SHOP_TIME_ZONE, shopHour } from "@/lib/time/shop-day";

/**
 * Small pure helpers that put a date on the shop's calendar day for server
 * pages and exports (see shop-day.ts for the day arithmetic itself).
 */

export type GreetingPeriod = "morning" | "afternoon" | "evening";

/** Which greeting the dashboard shows at `now`. */
export function greetingPeriod(now: Date): GreetingPeriod {
  const hour = shopHour(now);
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

/** The date cell of the expenses export: the shop's day, not the server's. */
export function expenseCsvDate(date: Date, localeTag: string): string {
  return date.toLocaleDateString(localeTag, { timeZone: SHOP_TIME_ZONE });
}

/**
 * Month and day of a YYYY-MM-DD string, for chart axes. The string is already a
 * calendar day, so it is read as UTC midnight and written in UTC: no zone can
 * move it to the day before.
 */
export function shortDayLabel(day: string, localeTag: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString(localeTag, {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  });
}
