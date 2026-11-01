import type { Locale } from "@/lib/i18n";

/**
 * The calm message shown when the app cannot reach its own local service
 * (restarting, or no answer), and the different one for a device with no
 * network. Same keys in ar, fr and en.
 */
export const RUNTIME_HEALTH_RUNTIME: Record<Locale, Record<string, string>> = {
  ar: {
    "runtimeHealth.reconnecting.title": "جارٍ إعادة الاتصال بخدمة التطبيق على هذا الجهاز",
    "runtimeHealth.reconnecting.body":
      "تعذّر الوصول إلى خدمة التطبيق الآن، وقد تكون تُعيد التشغيل. قد تظهر الصفحات فارغة أو غير محدَّثة إلى أن تعود. نواصل المحاولة وستختفي هذه الرسالة وحدها.",
    "runtimeHealth.offline.title": "لا توجد شبكة على هذا الجهاز",
    "runtimeHealth.offline.body":
      "تعذّر الوصول إلى خدمة التطبيق، والجهاز يُبلغ عن عدم وجود شبكة. سيعيد التطبيق الاتصال وحده عند عودة الشبكة.",
    "runtimeHealth.retry": "إعادة المحاولة",
    "runtimeHealth.retrying": "جارٍ المحاولة…",
  },
  fr: {
    "runtimeHealth.reconnecting.title": "Reconnexion au service de l'application sur cet appareil",
    "runtimeHealth.reconnecting.body":
      "L'application n'arrive pas à joindre son service pour le moment ; il est peut-être en train de redémarrer. Les pages peuvent sembler vides ou pas à jour tant qu'il n'est pas revenu. Nous continuons d'essayer et ce message disparaîtra tout seul.",
    "runtimeHealth.offline.title": "Pas de réseau sur cet appareil",
    "runtimeHealth.offline.body":
      "L'application n'arrive pas à joindre son service et l'appareil signale qu'il n'a pas de réseau. Elle se reconnectera toute seule dès que le réseau reviendra.",
    "runtimeHealth.retry": "Réessayer",
    "runtimeHealth.retrying": "Nouvelle tentative…",
  },
  en: {
    "runtimeHealth.reconnecting.title": "Reconnecting to the app's service on this device",
    "runtimeHealth.reconnecting.body":
      "The app can't reach its service right now. It may be restarting. Pages can look empty or out of date until it is back. We keep trying, and this message goes away by itself.",
    "runtimeHealth.offline.title": "No network on this device",
    "runtimeHealth.offline.body":
      "The app can't reach its service and this device reports no network. It reconnects by itself when the network is back.",
    "runtimeHealth.retry": "Try again",
    "runtimeHealth.retrying": "Trying again…",
  },
};

export function getRuntimeHealthRuntimeTranslation(locale: Locale, key: string): string | undefined {
  return RUNTIME_HEALTH_RUNTIME[locale]?.[key];
}
