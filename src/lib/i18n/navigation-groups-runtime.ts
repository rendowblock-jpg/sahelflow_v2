import type { Locale } from "@/lib/i18n";

/** Runtime copy for the sidebar group headers (Today / Sales / Delivery / Money / Automation). */
const COPY = {
  ar: {
    "nav.groupToday": "اليوم",
    "nav.groupSales": "البيع",
    "nav.groupDelivery": "التسليم",
    "nav.groupMoney": "المال",
    "nav.groupAutomation": "الأتمتة",
  },
  fr: {
    "nav.groupToday": "Aujourd'hui",
    "nav.groupSales": "Ventes",
    "nav.groupDelivery": "Livraison",
    "nav.groupMoney": "Argent",
    "nav.groupAutomation": "Automatisation",
  },
  en: {
    "nav.groupToday": "Today",
    "nav.groupSales": "Sales",
    "nav.groupDelivery": "Delivery",
    "nav.groupMoney": "Money",
    "nav.groupAutomation": "Automation",
  },
} as const satisfies Record<Locale, Readonly<Record<string, string>>>;

export function getNavigationGroupsRuntimeTranslation(locale: Locale, key: string): string | undefined {
  return (COPY[locale] as Readonly<Record<string, string>>)[key];
}
