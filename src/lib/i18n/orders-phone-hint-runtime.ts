import type { Locale } from "@/lib/i18n";

/**
 * The hint of the orders search box on a phone. The long desktop hint
 * (orders.filters.searchPlaceholder) is cut at 360 px; this one is short
 * enough for the room a phone leaves (budget at 16 px: en 26, fr 30, ar 24 characters).
 */
const translations: Record<Locale, Record<string, string>> = {
  en: {
    "orders.searchHintPhone": "Search order or customer",
  },
  fr: {
    "orders.searchHintPhone": "Rechercher commande ou client",
  },
  ar: {
    "orders.searchHintPhone": "ابحث عن طلبية أو زبون",
  },
};

export function getOrdersPhoneHintRuntimeTranslation(locale: Locale, key: string): string | undefined {
  return translations[locale][key];
}
