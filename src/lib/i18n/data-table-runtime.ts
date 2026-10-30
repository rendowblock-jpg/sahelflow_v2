import type { Locale } from "@/lib/i18n";

/** Copy for the phone card layout of the shared table (sorting and list name). Same keys in ar, fr and en. */
const translations: Record<Locale, Record<string, string>> = {
  ar: {
    "dataTable.cards.list": "النتائج",
    "dataTable.sort.by": "ترتيب حسب",
    "dataTable.sort.default": "الترتيب الافتراضي",
    "dataTable.sort.asc": "{{label}}، تصاعدي",
    "dataTable.sort.desc": "{{label}}، تنازلي",
  },
  fr: {
    "dataTable.cards.list": "Résultats",
    "dataTable.sort.by": "Trier par",
    "dataTable.sort.default": "Ordre par défaut",
    "dataTable.sort.asc": "{{label}}, croissant",
    "dataTable.sort.desc": "{{label}}, décroissant",
  },
  en: {
    "dataTable.cards.list": "Results",
    "dataTable.sort.by": "Sort by",
    "dataTable.sort.default": "Default order",
    "dataTable.sort.asc": "{{label}}, ascending",
    "dataTable.sort.desc": "{{label}}, descending",
  },
};

export function getDataTableRuntimeTranslation(locale: Locale, key: string): string | undefined {
  return translations[locale]?.[key];
}
