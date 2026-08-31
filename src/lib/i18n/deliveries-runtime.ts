import type { Locale } from "@/lib/i18n";

/**
 * Runtime dictionary for the deliveries surface (R3-d).
 *
 * Covers the manual bulk tracking-sync toolbar (d4 fix #7: "bulk 'sync all in
 * transit' + last-sync health") and the courier fee preview shown before
 * booking (d4 fix #8 part: per-wilaya fee display). Keys are candidates for
 * promotion into src/lib/i18n/locales/*.json during the central locale pass.
 *
 * Reused keys (NOT duplicated here): deliveries.sync / syncSuccess /
 * syncFailed (per-row sync), deliveries.filter.inTransit, deliveries.subtitle.
 */
const translations: Record<Locale, Record<string, string>> = {
  en: {
    "deliveries.bulkSync.action": "Sync all in transit",
    "deliveries.bulkSync.preparing": "Preparing…",
    "deliveries.bulkSync.progress": "Syncing {{done}}/{{total}}",
    "deliveries.bulkSync.success": "{{n}} shipments synced",
    "deliveries.bulkSync.partial": "{{ok}} synced, {{fail}} failed",
    "deliveries.bulkSync.none": "No in-transit shipments to sync",
    "deliveries.bulkSync.capped":
      "Only the {{n}} most recent in-transit shipments were synced.",
    "deliveries.bulkSync.reconciliationHint":
      "Some shipments need reconciliation on their page.",
    "deliveries.bulkSync.fetchFailed": "Could not load in-transit shipments",
    "deliveries.bulkSync.lastSync": "Last sync: {{time}}",
    "deliveries.fee.estimate":
      "Estimated delivery fee to {{wilaya}}: {{fee}} (home delivery)",
  },
  fr: {
    "deliveries.bulkSync.action": "Synchroniser tous les colis en cours",
    "deliveries.bulkSync.preparing": "Préparation…",
    "deliveries.bulkSync.progress": "Synchronisation {{done}}/{{total}}",
    "deliveries.bulkSync.success": "{{n}} colis synchronisés",
    "deliveries.bulkSync.partial": "{{ok}} synchronisés, {{fail}} échoués",
    "deliveries.bulkSync.none": "Aucun colis en cours à synchroniser",
    "deliveries.bulkSync.capped":
      "Seuls les {{n}} colis en cours les plus récents ont été synchronisés.",
    "deliveries.bulkSync.reconciliationHint":
      "Certains colis exigent une réconciliation sur leur page.",
    "deliveries.bulkSync.fetchFailed": "Impossible de charger les colis en cours",
    "deliveries.bulkSync.lastSync": "Dernière synchronisation : {{time}}",
    "deliveries.fee.estimate":
      "Frais de livraison estimés vers {{wilaya}} : {{fee}} (livraison à domicile)",
  },
  ar: {
    "deliveries.bulkSync.action": "مزامنة جميع الشحنات الجارية",
    "deliveries.bulkSync.preparing": "جارٍ التحضير…",
    "deliveries.bulkSync.progress": "المزامنة {{done}}/{{total}}",
    "deliveries.bulkSync.success": "تمت مزامنة {{n}} شحنة",
    "deliveries.bulkSync.partial": "تمت مزامنة {{ok}}، وفشلت {{fail}}",
    "deliveries.bulkSync.none": "لا توجد شحنات جارية للمزامنة",
    "deliveries.bulkSync.capped": "تمت مزامنة {{n}} من أحدث الشحنات الجارية فقط.",
    "deliveries.bulkSync.reconciliationHint":
      "بعض الشحنات تحتاج إلى تسوية في صفحتها.",
    "deliveries.bulkSync.fetchFailed": "تعذّر تحميل الشحنات الجارية",
    "deliveries.bulkSync.lastSync": "آخر مزامنة: {{time}}",
    "deliveries.fee.estimate":
      "رسوم التوصيل المقدّرة إلى {{wilaya}}: {{fee}} (توصيل إلى المنزل)",
  },
};

export function getDeliveriesRuntimeTranslation(
  locale: Locale,
  key: string,
): string | undefined {
  return translations[locale][key];
}
