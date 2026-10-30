import { SHOP_TIME_ZONE } from "@/lib/time/shop-day";
import { intlLocale } from "@/lib/utils";

/** "HH:mm" in the shop's time zone (Algeria), 24-hour, for saved-data banners. */
export function formatStateClock(
  value: Date | number | string,
  locale: string,
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(intlLocale(locale), {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: SHOP_TIME_ZONE,
  }).format(date);
}
