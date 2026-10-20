const DAY_MS = 86_400_000;

/**
 * Calendar days from `from` to `to` on the device's clock: 0 is the same date,
 * 1 is the next date, and so on (negative when `to` is earlier).
 *
 * Counting dates, not blocks of 24 hours, is what "yesterday" means: a message
 * sent on Sunday evening is two calendar days old on Tuesday morning although
 * only 31 hours have passed. The dates are compared as UTC midnights built
 * from the LOCAL year, month and day, so a daylight-saving shift can never
 * change the count.
 */
export function calendarDayDiff(from: number | Date, to: number | Date): number {
  const first = new Date(from);
  const second = new Date(to);
  const start = Date.UTC(first.getFullYear(), first.getMonth(), first.getDate());
  const end = Date.UTC(second.getFullYear(), second.getMonth(), second.getDate());
  return Math.round((end - start) / DAY_MS);
}
