import type { Locale } from "@/lib/i18n";

/**
 * The names of the three money figures (orders value, revenue delivered, net
 * revenue) and the two chart titles built on them. Same keys in ar, fr and en.
 * "Net revenue" in ar and fr reuses the term the accounting card already has.
 * No computed number depends on these strings.
 */
export const MONEY_NAMES_RUNTIME: Record<Locale, Record<string, string>> = {
  ar: {
    "money.ordersValue": "قيمة الطلبات",
    "money.revenueDelivered": "الإيراد المسلَّم",
    "money.netRevenue": "صافي الإيرادات",
    "money.ordersValueToday": "قيمة طلبات اليوم",
    "money.ordersValueTrend": "تطور قيمة الطلبات",
    "money.ordersValueTrendDesc": "قيمة الطلبات المسجلة يومياً خلال الفترة المحددة",
  },
  fr: {
    "money.ordersValue": "Valeur des commandes",
    "money.revenueDelivered": "Revenu livré",
    "money.netRevenue": "Revenu net",
    "money.ordersValueToday": "Valeur des commandes aujourd'hui",
    "money.ordersValueTrend": "Évolution de la valeur des commandes",
    "money.ordersValueTrendDesc": "Valeur quotidienne des commandes passées sur la période sélectionnée",
  },
  en: {
    "money.ordersValue": "Orders value",
    "money.revenueDelivered": "Revenue delivered",
    "money.netRevenue": "Net revenue",
    "money.ordersValueToday": "Orders value today",
    "money.ordersValueTrend": "Orders value trend",
    "money.ordersValueTrendDesc": "Daily value of orders placed over the selected period",
  },
};

export function getMoneyNamesRuntimeTranslation(locale: Locale, key: string): string | undefined {
  return MONEY_NAMES_RUNTIME[locale]?.[key];
}
