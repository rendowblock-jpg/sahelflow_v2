import type { Locale } from "@/lib/i18n";

/**
 * Runtime dictionary for the R4-d analytics upgrade (courier performance
 * module, URL-persisted date range, KPI drill-down, CSV export).
 *
 * Existing static keys stay authoritative where they are semantically exact
 * (analytics.last7Days/last30Days/last90Days, analytics.delivered/
 * inTransit/returnRate/deliveryRate/totalRevenue/avgOrderValue, nav.orders,
 * orders.filters.dateRange/dateCustom/from/to). Only R4-d-owned copy ships
 * here. Keys are candidates for promotion into the locale JSON bundle during
 * the central locale pass (locales/*.json are PR #355-owned).
 */
const translations: Record<Locale, Record<string, string>> = {
  en: {
    "analytics.courier.title": "Courier performance",
    "analytics.courier.description":
      "Delivery rate, average delivery days, returns and fees per courier — the #1 COD cost lever.",
    "analytics.courier.provider": "Courier",
    "analytics.courier.shipments": "Shipments",
    "analytics.courier.avgDeliveryDays": "Avg delivery days",
    "analytics.courier.returnRefusalRate": "Return / refusal rate",
    "analytics.courier.fees": "Delivery fees",
    "analytics.courier.matrix.title": "Wilaya × courier success rate",
    "analytics.courier.matrix.description":
      "Delivered share per wilaya and courier — top 10 wilayas by shipment volume.",
    "analytics.courier.matrix.successRate": "Success rate",
    "analytics.courier.empty": "No courier shipments in this range yet.",
    "analytics.courier.viewOrders": "View orders",
    "analytics.courier.viewDelivered": "View delivered orders",
    "analytics.courier.viewReturns": "View returned orders",
    "analytics.range.apply": "Apply",
    "analytics.range.invalid": "Enter a valid start and end date.",
    "analytics.range.windowLabel": "{{from}} → {{to}}",
    "analytics.export.csv": "Export CSV",
    "analytics.export.kpiTitle": "Key metrics",
    "analytics.export.range": "Range",
    "analytics.export.rangeValue": "{{from}} to {{to}}",
  },
  fr: {
    "analytics.courier.title": "Performance des transporteurs",
    "analytics.courier.description":
      "Taux de livraison, délai moyen, retours et frais par transporteur — le premier levier de coût COD.",
    "analytics.courier.provider": "Transporteur",
    "analytics.courier.shipments": "Expéditions",
    "analytics.courier.avgDeliveryDays": "Délai de livraison moyen",
    "analytics.courier.returnRefusalRate": "Taux de retour / refus",
    "analytics.courier.fees": "Frais de livraison",
    "analytics.courier.matrix.title": "Taux de succès wilaya × transporteur",
    "analytics.courier.matrix.description":
      "Part des livraisons par wilaya et transporteur — 10 premières wilayas par volume d'expéditions.",
    "analytics.courier.matrix.successRate": "Taux de succès",
    "analytics.courier.empty":
      "Aucune expédition transporteur sur cette période.",
    "analytics.courier.viewOrders": "Voir les commandes",
    "analytics.courier.viewDelivered": "Voir les commandes livrées",
    "analytics.courier.viewReturns": "Voir les commandes retournées",
    "analytics.range.apply": "Appliquer",
    "analytics.range.invalid": "Saisissez des dates de début et de fin valides.",
    "analytics.range.windowLabel": "{{from}} → {{to}}",
    "analytics.export.csv": "Exporter CSV",
    "analytics.export.kpiTitle": "Indicateurs clés",
    "analytics.export.range": "Période",
    "analytics.export.rangeValue": "{{from}} au {{to}}",
  },
  ar: {
    "analytics.courier.title": "أداء شركات التوصيل",
    "analytics.courier.description":
      "نسبة التوصيل ومتوسط أيام التوصيل والمرتجعات والرسوم لكل شركة — أكبر رافعة لتكلفة الدفع عند الاستلام.",
    "analytics.courier.provider": "شركة التوصيل",
    "analytics.courier.shipments": "الشحنات",
    "analytics.courier.avgDeliveryDays": "متوسط أيام التوصيل",
    "analytics.courier.returnRefusalRate": "نسبة الإرجاع / الرفض",
    "analytics.courier.fees": "رسوم التوصيل",
    "analytics.courier.matrix.title": "نسبة نجاح الولاية × شركة التوصيل",
    "analytics.courier.matrix.description":
      "نسبة التسليم لكل ولاية وشركة توصيل — أهم 10 ولايات حسب حجم الشحنات.",
    "analytics.courier.matrix.successRate": "نسبة النجاح",
    "analytics.courier.empty": "لا توجد شحنات لشركات التوصيل في هذه الفترة بعد.",
    "analytics.courier.viewOrders": "عرض الطلبيات",
    "analytics.courier.viewDelivered": "عرض الطلبيات المسلَّمة",
    "analytics.courier.viewReturns": "عرض الطلبيات المرتجعة",
    "analytics.range.apply": "تطبيق",
    "analytics.range.invalid": "أدخل تاريخ بداية ونهاية صحيحين.",
    "analytics.range.windowLabel": "{{from}} – {{to}}",
    "analytics.export.csv": "تصدير CSV",
    "analytics.export.kpiTitle": "المؤشرات الرئيسية",
    "analytics.export.range": "الفترة",
    "analytics.export.rangeValue": "{{from}} إلى {{to}}",
  },
};

export function getAnalyticsRuntimeTranslation(
  locale: Locale,
  key: string,
): string | undefined {
  return translations[locale][key];
}
