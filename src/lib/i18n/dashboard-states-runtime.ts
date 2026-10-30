import type { Locale } from "@/lib/i18n";

/**
 * Plain-words definitions of the revenue numbers on the dashboard, analytics
 * and accounting pages, and the copy of the "show as table" chart toggle.
 * Same keys in ar, fr and en. No computed number depends on these strings.
 */
const translations: Record<Locale, Record<string, string>> = {
  ar: {
    "dashboard.revenueDefinition":
      "إيرادات اليوم = قيمة الطلبيات المسجلة اليوم، دون الملغاة والمسودات، أما الطلبيات المرتجعة أو المرفوضة فتبقى محسوبة. المُحصَّل اليوم = قيمة الطلبيات المسلَّمة اليوم، وتُحتسب عند التسليم. هذه قيم طلبيات وليست نقداً في اليد: النقد القادم من شركات التوصيل تجده في المحاسبة.",
    "analytics.revenueDefinition":
      "الإيرادات = قيمة الطلبيات المسجلة في الفترة المحددة، دون الملغاة والمسودات، أما المرتجعة أو المرفوضة فتبقى محسوبة. ليست نقداً في اليد ولا صافية من المرتجعات. جدول المقارنة يستخدم الإيراد المحتسب عند التسليم.",
    "accounting.netRevenueDefinition":
      "صافي الإيرادات = قيمة الطلبيات المسلَّمة خلال آخر 30 يوماً مطروحاً منها المبالغ المستردة والمرتجعات. يختلف عن الإيرادات في لوحة التحكم التي تحتسب الطلبيات المسجلة.",
    "charts.showAsTable": "عرض كجدول",
    "charts.showAsChart": "عرض كمخطط",
    "charts.tableOf": "جدول: {{title}}",
    "charts.colDate": "التاريخ",
    "charts.colMonth": "الشهر",
  },
  fr: {
    "dashboard.revenueDefinition":
      "Revenu du jour = valeur des commandes passées aujourd'hui. Les commandes annulées et les brouillons ne sont pas comptés ; les commandes retournées ou refusées le sont encore. Encaissé aujourd'hui = valeur des commandes livrées aujourd'hui, comptée à la livraison. Ce sont des valeurs de commandes, pas de l'argent en main : l'argent des transporteurs se voit dans Comptabilité.",
    "analytics.revenueDefinition":
      "Chiffre d'affaires = valeur des commandes passées sur la période choisie. Les commandes annulées et les brouillons ne sont pas comptés ; les commandes retournées ou refusées le sont encore. Ce n'est ni de l'argent en main ni un montant net des retours. Le tableau de comparaison utilise le revenu compté à la livraison.",
    "accounting.netRevenueDefinition":
      "Revenu net = valeur des commandes livrées au cours des 30 derniers jours, moins les remboursements et retours clients. Il diffère du Revenu du tableau de bord, qui compte les commandes passées.",
    "charts.showAsTable": "Afficher en tableau",
    "charts.showAsChart": "Afficher en graphique",
    "charts.tableOf": "Tableau : {{title}}",
    "charts.colDate": "Date",
    "charts.colMonth": "Mois",
  },
  en: {
    "dashboard.revenueDefinition":
      "Revenue today = value of orders placed today. Cancelled orders and drafts are not counted; returned or refused orders still are. Collected today = value of orders delivered today, counted when delivered. These are order values, not cash in hand: the cash from couriers is in Accounting.",
    "analytics.revenueDefinition":
      "Revenue = value of orders placed in the selected period. Cancelled orders and drafts are not counted; returned or refused orders still are. It is not cash in hand and not net of returns. The comparison table uses revenue counted at delivery.",
    "accounting.netRevenueDefinition":
      "Net revenue = value of orders delivered in the last 30 days, minus customer refunds and returns. It differs from Revenue on the dashboard, which counts orders placed.",
    "charts.showAsTable": "Show as table",
    "charts.showAsChart": "Show as chart",
    "charts.tableOf": "Table: {{title}}",
    "charts.colDate": "Date",
    "charts.colMonth": "Month",
  },
};

export function getDashboardStatesRuntimeTranslation(locale: Locale, key: string): string | undefined {
  return translations[locale]?.[key];
}
