import { shopHour } from "@/lib/time/shop-day";

/**
 * Quiet hours: the window in which the app must not notify.
 *
 * The window is a pair of minutes of the day (0-1439) on the SHOP clock
 * (Africa/Algiers), never the clock of the computer or server that runs the
 * app. Start is inside the window, end is outside it. When end is before
 * start the window wraps midnight (22:00-07:00). Equal minutes or a missing
 * minute mean no window.
 */
export type QuietWindow = Readonly<{
  quietStartMinute: number | null;
  quietEndMinute: number | null;
}>;

export function isInQuietHours(window: QuietWindow, at: Date): boolean {
  const { quietStartMinute: start, quietEndMinute: end } = window;
  if (start === null || end === null || start === end) return false;
  // Algeria is UTC+1 (a whole hour), so the shop minute is the UTC minute.
  const minute = shopHour(at) * 60 + at.getUTCMinutes();
  return start < end
    ? minute >= start && minute < end
    : minute >= start || minute < end;
}
