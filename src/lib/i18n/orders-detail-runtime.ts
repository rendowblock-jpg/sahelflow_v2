import type { Locale } from "@/lib/i18n";

/** Copy for the offline state of the order, delivery and return detail pages. Same keys in ar, fr and en. */
const translations: Record<Locale, Record<string, string>> = {
  ar: {
    "ordersDetail.offline.reason": "أنت غير متصل بالإنترنت",
    "ordersDetail.offline.banner":
      "التفاصيل المحفوظة تبقى مقروءة. التأكيد والرفض والشحن وتغيير الحالة والملاحظات والاسترداد ورسائل واتساب متوقفة إلى أن يعود الاتصال.",
  },
  fr: {
    "ordersDetail.offline.reason": "Vous êtes hors ligne",
    "ordersDetail.offline.banner":
      "Les détails enregistrés restent lisibles. Confirmer, rejeter, expédier, changer le statut, les notes, les remboursements et les messages WhatsApp sont en pause jusqu'au retour de la connexion.",
  },
  en: {
    "ordersDetail.offline.reason": "You are offline",
    "ordersDetail.offline.banner":
      "Saved details stay readable. Confirm, reject, ship, status changes, notes, refunds and WhatsApp messages are paused until you are back online.",
  },
};

export const ORDERS_DETAIL_RUNTIME_KEYS: readonly string[] = Object.keys(translations.en);

export function getOrdersDetailRuntimeTranslation(locale: Locale, key: string): string | undefined {
  return translations[locale]?.[key];
}
