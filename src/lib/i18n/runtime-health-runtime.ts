import type { Locale } from "@/lib/i18n";

/**
 * The calm message shown when the app cannot reach its own local service
 * (restarting, or no answer), and the different one for a device with no
 * network. Same keys in ar, fr and en.
 */
export const RUNTIME_HEALTH_RUNTIME: Record<Locale, Record<string, string>> = {
  ar: {
    "runtimeHealth.reconnecting.title": "جارٍ إعادة الاتصال بخدمة التطبيق",
    "runtimeHealth.reconnecting.body": "قد تبدو الصفحات فارغة إلى أن تعود الخدمة، ونواصل المحاولة.",
    "runtimeHealth.offline.title": "الجهاز بلا شبكة",
    "runtimeHealth.offline.body": "يعيد التطبيق الاتصال وحده عند عودة الشبكة.",
    "runtimeHealth.retry": "إعادة المحاولة",
    "runtimeHealth.retrying": "جارٍ المحاولة…",
    "runtimeHealth.close": "إغلاق",
    "runtimeHealth.reopen": "عرض التفاصيل",
  },
  fr: {
    "runtimeHealth.reconnecting.title": "Reconnexion à l'application",
    "runtimeHealth.reconnecting.body": "Les pages peuvent sembler vides jusqu'au retour ; nous réessayons.",
    "runtimeHealth.offline.title": "Appareil sans réseau",
    "runtimeHealth.offline.body": "L'application se reconnecte toute seule dès le retour du réseau.",
    "runtimeHealth.retry": "Réessayer",
    "runtimeHealth.retrying": "Nouvelle tentative…",
    "runtimeHealth.close": "Fermer",
    "runtimeHealth.reopen": "Afficher les détails",
  },
  en: {
    "runtimeHealth.reconnecting.title": "Reconnecting to the app service",
    "runtimeHealth.reconnecting.body": "Pages may look empty until it is back; we keep trying.",
    "runtimeHealth.offline.title": "No network on this device",
    "runtimeHealth.offline.body": "The app reconnects by itself when the network is back.",
    "runtimeHealth.retry": "Try again",
    "runtimeHealth.retrying": "Trying again…",
    "runtimeHealth.close": "Close",
    "runtimeHealth.reopen": "Show details",
  },
};

export function getRuntimeHealthRuntimeTranslation(locale: Locale, key: string): string | undefined {
  return RUNTIME_HEALTH_RUNTIME[locale]?.[key];
}
