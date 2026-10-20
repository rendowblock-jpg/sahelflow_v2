import { calendarDayDiff } from "@/lib/calendar-days";
import { intlLocale } from "@/lib/utils";

/**
 * How old a conversation is, in the words the inbox shows next to it: "now",
 * minutes, hours, then CALENDAR days ("yesterday", "the day before yesterday",
 * a weekday count) and a short date from seven days on. Intl owns the words,
 * the digits and the plural forms in Arabic, French and English.
 *
 * Inside the first 24 hours the age is elapsed time. From then on it is the
 * number of calendar days, because that is what a seller means by "yesterday":
 * Sunday 19:39 is two days old on Tuesday 02:24 although only 31 hours passed.
 */
export function formatInboxAge(
  value: number,
  now: number,
  locale: "ar" | "fr" | "en",
): string {
  const rtf = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: "auto" });
  const minutes = Math.floor(Math.max(0, now - value) / 60_000);
  if (minutes < 1) return rtf.format(0, "second");
  if (minutes < 60) return rtf.format(-minutes, "minute");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return rtf.format(-hours, "hour");
  const days = Math.max(1, calendarDayDiff(value, now));
  if (days < 7) return rtf.format(-days, "day");
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "short",
  }).format(new Date(value));
}
