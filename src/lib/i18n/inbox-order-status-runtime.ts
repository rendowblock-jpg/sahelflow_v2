import type { Locale } from "@/lib/i18n";

/**
 * Runtime dictionary for order-status labels rendered by the inbox customer
 * work panel (R5-d).
 *
 * The panel's former inline ORDER_STATUS_COPY dictionary (14 keys, en/fr/ar)
 * migrated here verbatim. The static orders.status.* locale-JSON keys are
 * intentionally NOT reused for these labels: their Arabic values diverge
 * (مشحون/تم التوصيل/ملغي/مُرجَع vs تم الشحن/تم التسليم/ملغى/مرتجع) and four
 * panel statuses (processing, packed, completed, canceled,
 * return_completed, failed) have no static key at all — the central locale
 * pass should reconcile the two sets. Keys are candidates for promotion
 * into the locale JSON bundle then (locales/*.json are PR #355-owned).
 */
const translations: Record<Locale, Record<string, string>> = {
  en: {
    "inbox.orderStatus.draft": "Draft",
    "inbox.orderStatus.pending": "Pending",
    "inbox.orderStatus.confirmed": "Confirmed",
    "inbox.orderStatus.processing": "Processing",
    "inbox.orderStatus.packed": "Packed",
    "inbox.orderStatus.shipped": "Shipped",
    "inbox.orderStatus.delivered": "Delivered",
    "inbox.orderStatus.completed": "Completed",
    "inbox.orderStatus.cancelled": "Cancelled",
    "inbox.orderStatus.canceled": "Cancelled",
    "inbox.orderStatus.refused": "Refused",
    "inbox.orderStatus.returned": "Returned",
    "inbox.orderStatus.return_completed": "Return completed",
    "inbox.orderStatus.failed": "Failed",
  },
  fr: {
    "inbox.orderStatus.draft": "Brouillon",
    "inbox.orderStatus.pending": "En attente",
    "inbox.orderStatus.confirmed": "Confirmée",
    "inbox.orderStatus.processing": "En préparation",
    "inbox.orderStatus.packed": "Emballée",
    "inbox.orderStatus.shipped": "Expédiée",
    "inbox.orderStatus.delivered": "Livrée",
    "inbox.orderStatus.completed": "Terminée",
    "inbox.orderStatus.cancelled": "Annulée",
    "inbox.orderStatus.canceled": "Annulée",
    "inbox.orderStatus.refused": "Refusée",
    "inbox.orderStatus.returned": "Retournée",
    "inbox.orderStatus.return_completed": "Retour terminé",
    "inbox.orderStatus.failed": "Échec",
  },
  ar: {
    "inbox.orderStatus.draft": "مسودة",
    "inbox.orderStatus.pending": "قيد الانتظار",
    "inbox.orderStatus.confirmed": "مؤكد",
    "inbox.orderStatus.processing": "قيد التحضير",
    "inbox.orderStatus.packed": "مجهز",
    "inbox.orderStatus.shipped": "تم الشحن",
    "inbox.orderStatus.delivered": "تم التسليم",
    "inbox.orderStatus.completed": "مكتمل",
    "inbox.orderStatus.cancelled": "ملغى",
    "inbox.orderStatus.canceled": "ملغى",
    "inbox.orderStatus.refused": "مرفوض",
    "inbox.orderStatus.returned": "مرتجع",
    "inbox.orderStatus.return_completed": "اكتمل الإرجاع",
    "inbox.orderStatus.failed": "فشل",
  },
};

export function getInboxOrderStatusRuntimeTranslation(
  locale: Locale,
  key: string,
): string | undefined {
  return translations[locale][key];
}
