import type { Locale } from "@/lib/i18n";

/**
 * Labels for money figures that were still called by the bare word "revenue".
 * Same keys in ar, fr and en. No computed number depends on these strings.
 *
 * money.revenueDeliveredToday  the Orders page card: value of the orders delivered
 *                              today (shop day), before any refund
 */
export const NUMBERS_LABELS_RUNTIME: Record<Locale, Record<string, string>> = {
  ar: {
    "money.revenueDeliveredToday": "الإيراد المسلَّم اليوم",
  },
  fr: {
    "money.revenueDeliveredToday": "Revenu livré aujourd'hui",
  },
  en: {
    "money.revenueDeliveredToday": "Revenue delivered today",
  },
};

export function getNumbersLabelsRuntimeTranslation(locale: Locale, key: string): string | undefined {
  return NUMBERS_LABELS_RUNTIME[locale]?.[key];
}
