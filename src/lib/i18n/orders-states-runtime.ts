import type { Locale } from "@/lib/i18n";

/** Copy for the offline / stale states of the orders, deliveries and returns lists. Same keys in ar, fr and en. */
const translations: Record<Locale, Record<string, string>> = {
  ar: {
    "ordersStates.offline.writesPaused": "الإجراءات الجماعية وتغيير الحالات متوقفة إلى أن يعود الاتصال.",
    "ordersStates.offline.syncNeedsConnection": "المزامنة تحتاج إلى اتصال بالإنترنت.",
  },
  fr: {
    "ordersStates.offline.writesPaused":
      "Les actions groupées et les changements de statut sont en pause jusqu'au retour de la connexion.",
    "ordersStates.offline.syncNeedsConnection": "La synchronisation a besoin d'une connexion internet.",
  },
  en: {
    "ordersStates.offline.writesPaused": "Bulk actions and status changes are paused until you are back online.",
    "ordersStates.offline.syncNeedsConnection": "Syncing needs an internet connection.",
  },
};

export const ORDERS_STATES_RUNTIME_KEYS: readonly string[] = Object.keys(translations.en);

export function getOrdersStatesRuntimeTranslation(locale: Locale, key: string): string | undefined {
  return translations[locale]?.[key];
}
