/**
 * The shop's calendar day.
 *
 * Every "today", "this month" and period start in SahelFlow is a day in
 * Algeria, not a day on the computer that happens to run the app. A seller
 * whose PC is set to another zone, or a server in UTC, must still see a sale
 * made at 00:30 Algeria time on the new day.
 *
 * Algeria is UTC+1 all year (no daylight saving since 1981), so shop midnight
 * is always 23:00 UTC of the day before and a day is always 24 hours. That
 * lets this module use plain arithmetic: it never reads the host time zone.
 * Dates stay UTC instants everywhere (database included); only the day edges
 * are computed here.
 */

export const SHOP_TIME_ZONE = "Africa/Algiers";

const HOUR_MS = 60 * 60 * 1000;
const SHOP_UTC_OFFSET_MS = HOUR_MS;
const DAY_MS = 24 * HOUR_MS;

/** The instant `at` expressed so that its UTC fields read as shop wall-clock. */
function shopWallClock(at: Date): Date {
  return new Date(at.getTime() + SHOP_UTC_OFFSET_MS);
}

/** Calendar day of `at` in shop time, as YYYY-MM-DD. */
export function shopDateString(at: Date): string {
  return shopWallClock(at).toISOString().slice(0, 10);
}

/** Hour of the day (0-23) of `at` in shop time. */
export function shopHour(at: Date): number {
  return shopWallClock(at).getUTCHours();
}

/** The instant of 00:00 shop time on the day that contains `at`. */
export function startOfShopDay(at: Date): Date {
  const wall = at.getTime() + SHOP_UTC_OFFSET_MS;
  const intoDay = ((wall % DAY_MS) + DAY_MS) % DAY_MS;
  return new Date(wall - intoDay - SHOP_UTC_OFFSET_MS);
}

/** `at` moved by whole days (a day is exactly 24 hours: no daylight saving). */
export function addShopDays(at: Date, days: number): Date {
  return new Date(at.getTime() + days * DAY_MS);
}

/** 00:00 shop time of a calendar date. `month` is 1-12; overflow rolls over. */
function shopMidnightOf(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day) - SHOP_UTC_OFFSET_MS);
}

/**
 * Strict YYYY-MM-DD to 00:00 shop time. Anything else, including a date that
 * does not exist (2026-02-31), gives null.
 */
export function parseShopDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }
  return shopMidnightOf(year, month, day);
}

/** A shop-time calendar month as a half-open range [gte, lt). `month` is 1-12. */
export function shopMonthRange(
  year: number,
  month: number,
): { gte: Date; lt: Date } {
  return {
    gte: shopMidnightOf(year, month, 1),
    lt: shopMidnightOf(year, month + 1, 1),
  };
}
