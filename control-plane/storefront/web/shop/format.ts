import type { PublicLocale } from "../locale";

const TAG: Record<PublicLocale, string> = { ar: "ar-DZ", fr: "fr-DZ", en: "en-GB" };
const SUFFIX: Record<PublicLocale, string> = { ar: " دج", fr: " DA", en: " DA" };

/** Same convention as the app's formatDZD: grouped digits and the dinar suffix. */
export function formatPrice(amount: number, locale: PublicLocale): string {
  return new Intl.NumberFormat(TAG[locale], { maximumFractionDigits: 0 }).format(amount) + SUFFIX[locale];
}

export function localeTag(locale: PublicLocale): string {
  return TAG[locale];
}

export function currencySuffix(locale: PublicLocale): string {
  return SUFFIX[locale];
}
