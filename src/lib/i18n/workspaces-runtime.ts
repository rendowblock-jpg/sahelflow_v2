import type { Locale } from "@/lib/i18n";

/**
 * Runtime dictionary for the operational list workspaces (orders / products /
 * customers) — scoped search, URL-driven filters, filtered-empty states and
 * the filtered export column header.
 *
 * The static locale JSON catalog is sequenced centrally (and is currently
 * frozen for this remediation wave); these keys ship in the runtime resolver so
 * the list search/filter muscle works in ar/fr/en immediately. Keys are
 * candidates for promotion into src/lib/i18n/locales/*.json during the central
 * locale pass.
 */
const translations: Record<Locale, Record<string, string>> = {
  en: {
    "common.clearFilters": "Clear filters",
    "common.clearSearch": "Clear search",
    "orders.filters.searchPlaceholder":
      "Search orders: number, customer, phone…",
    "orders.filters.wilayaAll": "All wilayas",
    "orders.filters.dateRange": "Date range",
    "orders.filters.dateAll": "All dates",
    "orders.filters.dateToday": "Today",
    "orders.filters.date7d": "Last 7 days",
    "orders.filters.date30d": "Last 30 days",
    "orders.filters.dateCustom": "Custom range",
    "orders.filters.from": "From",
    "orders.filters.to": "To",
    "orders.filters.clearAll": "Clear all",
    "orders.filters.active": "Active filters",
    "orders.filters.removeFilter": "Remove {{name}} filter",
    "orders.filteredEmpty.title": "No matching orders",
    "orders.filteredEmpty.description":
      "No orders match the current search and filters. Adjust or clear them.",
    "products.filteredEmpty.title": "No matching products",
    "products.filteredEmpty.description":
      "No products match the current search. Adjust or clear it.",
    "customers.filteredEmpty.title": "No matching customers",
    "customers.filteredEmpty.description":
      "No customers match the current search. Adjust or clear it.",
    "export.orders.provider": "Delivery provider",
  },
  fr: {
    "common.clearFilters": "Effacer les filtres",
    "common.clearSearch": "Effacer la recherche",
    "orders.filters.searchPlaceholder":
      "Rechercher des commandes : numéro, client, téléphone…",
    "orders.filters.wilayaAll": "Toutes les wilayas",
    "orders.filters.dateRange": "Période",
    "orders.filters.dateAll": "Toutes les dates",
    "orders.filters.dateToday": "Aujourd’hui",
    "orders.filters.date7d": "7 derniers jours",
    "orders.filters.date30d": "30 derniers jours",
    "orders.filters.dateCustom": "Période personnalisée",
    "orders.filters.from": "Du",
    "orders.filters.to": "Au",
    "orders.filters.clearAll": "Tout effacer",
    "orders.filters.active": "Filtres actifs",
    "orders.filters.removeFilter": "Retirer le filtre {{name}}",
    "orders.filteredEmpty.title": "Aucune commande correspondante",
    "orders.filteredEmpty.description":
      "Aucune commande ne correspond à la recherche et aux filtres actuels. Ajustez-les ou effacez-les.",
    "products.filteredEmpty.title": "Aucun produit correspondant",
    "products.filteredEmpty.description":
      "Aucun produit ne correspond à la recherche actuelle. Ajustez-la ou effacez-la.",
    "customers.filteredEmpty.title": "Aucun client correspondant",
    "customers.filteredEmpty.description":
      "Aucun client ne correspond à la recherche actuelle. Ajustez-la ou effacez-la.",
    "export.orders.provider": "Transporteur",
  },
  ar: {
    "common.clearFilters": "مسح عوامل التصفية",
    "common.clearSearch": "مسح البحث",
    "orders.filters.searchPlaceholder":
      "ابحث في الطلبيات: الرقم، العميل، الهاتف…",
    "orders.filters.wilayaAll": "كل الولايات",
    "orders.filters.dateRange": "الفترة",
    "orders.filters.dateAll": "كل التواريخ",
    "orders.filters.dateToday": "اليوم",
    "orders.filters.date7d": "آخر 7 أيام",
    "orders.filters.date30d": "آخر 30 يومًا",
    "orders.filters.dateCustom": "فترة مخصصة",
    "orders.filters.from": "من",
    "orders.filters.to": "إلى",
    "orders.filters.clearAll": "مسح الكل",
    "orders.filters.active": "عوامل التصفية النشطة",
    "orders.filters.removeFilter": "إزالة عامل التصفية {{name}}",
    "orders.filteredEmpty.title": "لا توجد طلبيات مطابقة",
    "orders.filteredEmpty.description":
      "لا توجد طلبيات تطابق البحث وعوامل التصفية الحالية. عدّلها أو امسحها.",
    "products.filteredEmpty.title": "لا توجد منتجات مطابقة",
    "products.filteredEmpty.description":
      "لا توجد منتجات تطابق البحث الحالي. عدّله أو امسحه.",
    "customers.filteredEmpty.title": "لا يوجد عملاء مطابقون",
    "customers.filteredEmpty.description":
      "لا يوجد عملاء يطابقون البحث الحالي. عدّله أو امسحه.",
    "export.orders.provider": "شركة التوصيل",
  },
};

export function getWorkspacesRuntimeTranslation(
  locale: Locale,
  key: string,
): string | undefined {
  return translations[locale][key];
}
