import type { Locale } from "@/lib/i18n";

/** Copy for the customers / products / storefront list states. Same keys in ar, fr and en. */
const translations: Record<Locale, Record<string, string>> = {
  ar: {
    "storefront.list.clearFilters": "مسح البحث والتصفية",
  },
  fr: {
    "storefront.list.clearFilters": "Effacer la recherche et le filtre",
  },
  en: {
    "storefront.list.clearFilters": "Clear search and filter",
  },
};

export function getCustomersProductsStatesRuntimeTranslation(locale: Locale, key: string): string | undefined {
  return translations[locale]?.[key];
}
