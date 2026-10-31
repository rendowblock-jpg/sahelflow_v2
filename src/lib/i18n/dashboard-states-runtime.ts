import type { Locale } from "@/lib/i18n";

/**
 * Plain-words definitions of the revenue numbers on the dashboard, analytics
 * and accounting pages, and the copy of the "show as table" chart toggle.
 * Same keys in ar, fr and en. No computed number depends on these strings.
 */
const translations: Record<Locale, Record<string, string>> = {
  ar: {
    "dashboard.deliveredToday": "المُسلَّم اليوم",
    "dashboard.revenueDefinition":
      "إيرادات اليوم = قيمة الطلبيات المسجلة اليوم، دون الملغاة والمسودات، أما الطلبيات المرتجعة أو المرفوضة فتبقى محسوبة. المُسلَّم اليوم = قيمة الطلبيات المسلَّمة اليوم، وتُحتسب عند التسليم. هذه قيم طلبيات وليست نقداً في اليد: النقد القادم من شركات التوصيل تجده في المحاسبة.",
    "analytics.revenueDefinition":
      "الإيرادات = قيمة الطلبيات المسجلة في الفترة المحددة، دون الملغاة والمسودات، أما المرتجعة أو المرفوضة فتبقى محسوبة. ليست نقداً في اليد ولا صافية من المرتجعات. جدول المقارنة يستخدم الإيراد المحتسب عند التسليم.",
    "accounting.netRevenueDefinition":
      "صافي الإيرادات = قيمة الطلبيات المسلَّمة خلال آخر 30 يوماً مطروحاً منها المبالغ المستردة والمرتجعات. يختلف عن الإيرادات في لوحة التحكم التي تحتسب الطلبيات المسجلة.",
    "charts.showAsTable": "عرض كجدول",
    "charts.showAsChart": "عرض كمخطط",
    "charts.tableOf": "جدول: {{title}}",
    "charts.colDate": "التاريخ",
    "charts.colMonth": "الشهر",
    "charts.colStatus": "الحالة",
    "charts.colProduct": "المنتج",
    "charts.colWilaya": "الولاية",
    "charts.colHour": "الساعة",
    "charts.colReturnRate": "نسبة الإرجاع",
    "charts.colDetail": "التفاصيل",
    "charts.colWeek": "الأسبوع",
    "automations.failure.line": "الخطوة {{step}} «{{action}}» لم تكتمل: {{reason}}",
    "automations.failure.lineNoStep": "لم يكتمل هذا التشغيل: {{reason}}",
    "automations.failure.whatsappUnavailable": "واتساب غير متصل أو أن الإرسال متوقف. أعد الاتصال ثم أعد المحاولة.",
    "automations.failure.whatsappFailed": "تعذّر على واتساب تسليم الرسالة.",
    "automations.failure.messageEmpty": "كانت الرسالة فارغة. عدّل نص الرسالة في الأتمتة ثم أعد المحاولة.",
    "automations.failure.orderMissing": "الطلبية لم تعد موجودة أو لم يتم العثور عليها.",
    "automations.failure.conditionNotMet": "لم تعد الطلبية في الحالة التي تتوقعها هذه الخطوة، لذلك لم يتغير شيء.",
    "automations.failure.unsure": "لا يمكننا التأكد هل نُفّذت هذه الخطوة سابقاً. تحقق من الطلبية أو المحادثة قبل إعادة المحاولة.",
    "automations.failure.interrupted": "أُغلق التطبيق أو أُعيد تشغيله أثناء هذه الخطوة. يمكنك إعادة المحاولة بأمان.",
    "automations.failure.exhausted": "فشلت عدة مرات متتالية فتوقفت.",
    "automations.failure.other": "حدثت مشكلة غير متوقعة. الرمز التقني تجده ضمن التفاصيل.",
    "automations.hold": "إيقاف هذه الأتمتة مؤقتاً",
    "automations.holdHint": "توقف التشغيلات الجديدة حتى تعيد تفعيلها. يبقى هذا التشغيل الفاشل كما هو.",
    "automations.holdFailed": "تعذّر إيقاف الأتمتة. حاول مرة أخرى.",
    "automations.notFound.title": "لم نعثر على هذه الأتمتة",
    "automations.notFound.message": "ربما حُذفت أو أن الرابط قديم. باقي أتمتتك لم تتأثر.",
    "automations.notFound.back": "العودة إلى الأتمتة",
  },
  fr: {
    "dashboard.deliveredToday": "Livré aujourd'hui",
    "dashboard.revenueDefinition":
      "Revenu du jour = valeur des commandes passées aujourd'hui. Les commandes annulées et les brouillons ne sont pas comptés ; les commandes retournées ou refusées le sont encore. Livré aujourd'hui = valeur des commandes livrées aujourd'hui, comptée à la livraison. Ce sont des valeurs de commandes, pas de l'argent en main : l'argent des transporteurs se voit dans Comptabilité.",
    "analytics.revenueDefinition":
      "Chiffre d'affaires = valeur des commandes passées sur la période choisie. Les commandes annulées et les brouillons ne sont pas comptés ; les commandes retournées ou refusées le sont encore. Ce n'est ni de l'argent en main ni un montant net des retours. Le tableau de comparaison utilise le revenu compté à la livraison.",
    "accounting.netRevenueDefinition":
      "Revenu net = valeur des commandes livrées au cours des 30 derniers jours, moins les remboursements et retours clients. Il diffère du Revenu du tableau de bord, qui compte les commandes passées.",
    "charts.showAsTable": "Afficher en tableau",
    "charts.showAsChart": "Afficher en graphique",
    "charts.tableOf": "Tableau : {{title}}",
    "charts.colDate": "Date",
    "charts.colMonth": "Mois",
    "charts.colStatus": "Statut",
    "charts.colProduct": "Produit",
    "charts.colWilaya": "Wilaya",
    "charts.colHour": "Heure",
    "charts.colReturnRate": "Taux de retour",
    "charts.colDetail": "Détails",
    "charts.colWeek": "Semaine",
    "automations.failure.line": "Étape {{step}} « {{action}} » non terminée : {{reason}}",
    "automations.failure.lineNoStep": "Cette exécution n'est pas terminée : {{reason}}",
    "automations.failure.whatsappUnavailable": "WhatsApp n'est pas connecté ou l'envoi est en pause. Reconnectez-le, puis réessayez.",
    "automations.failure.whatsappFailed": "WhatsApp n'a pas pu remettre le message.",
    "automations.failure.messageEmpty": "Le message était vide. Modifiez le message de l'automatisation, puis réessayez.",
    "automations.failure.orderMissing": "La commande n'existe plus ou est introuvable.",
    "automations.failure.conditionNotMet": "La commande n'était plus dans l'état attendu par cette étape, rien n'a été modifié.",
    "automations.failure.unsure": "Nous ne pouvons pas être sûrs que cette étape ait déjà eu lieu. Vérifiez la commande ou la conversation avant de réessayer.",
    "automations.failure.interrupted": "L'application a été fermée ou redémarrée pendant cette étape. Vous pouvez réessayer sans risque.",
    "automations.failure.exhausted": "Elle a échoué plusieurs fois de suite et a été arrêtée.",
    "automations.failure.other": "Un problème inattendu. Le code technique est dans les Détails.",
    "automations.hold": "Mettre cette automatisation en pause",
    "automations.holdHint": "Les nouvelles exécutions s’arrêtent jusqu’à sa réactivation. Cette exécution échouée reste telle quelle.",
    "automations.holdFailed": "Impossible de la mettre en pause. Réessayez.",
    "automations.notFound.title": "Cette automatisation est introuvable",
    "automations.notFound.message": "Elle a peut-être été supprimée, ou le lien est ancien. Vos autres automatisations ne sont pas touchées.",
    "automations.notFound.back": "Retour aux automatisations",
  },
  en: {
    "dashboard.deliveredToday": "Delivered today",
    "dashboard.revenueDefinition":
      "Revenue today = value of orders placed today. Cancelled orders and drafts are not counted; returned or refused orders still are. Delivered today = value of orders delivered today, counted when delivered. These are order values, not cash in hand: the cash from couriers is in Accounting.",
    "analytics.revenueDefinition":
      "Revenue = value of orders placed in the selected period. Cancelled orders and drafts are not counted; returned or refused orders still are. It is not cash in hand and not net of returns. The comparison table uses revenue counted at delivery.",
    "accounting.netRevenueDefinition":
      "Net revenue = value of orders delivered in the last 30 days, minus customer refunds and returns. It differs from Revenue on the dashboard, which counts orders placed.",
    "charts.showAsTable": "Show as table",
    "charts.showAsChart": "Show as chart",
    "charts.tableOf": "Table: {{title}}",
    "charts.colDate": "Date",
    "charts.colMonth": "Month",
    "charts.colStatus": "Status",
    "charts.colProduct": "Product",
    "charts.colWilaya": "Wilaya",
    "charts.colHour": "Hour",
    "charts.colReturnRate": "Return rate",
    "charts.colDetail": "Details",
    "charts.colWeek": "Week",
    "automations.failure.line": "Step {{step}} “{{action}}” did not finish: {{reason}}",
    "automations.failure.lineNoStep": "This run did not finish: {{reason}}",
    "automations.failure.whatsappUnavailable": "WhatsApp is not connected or sending is paused. Reconnect it, then retry.",
    "automations.failure.whatsappFailed": "WhatsApp could not deliver the message.",
    "automations.failure.messageEmpty": "The message was empty. Edit the automation message, then retry.",
    "automations.failure.orderMissing": "The order no longer exists or was not found.",
    "automations.failure.conditionNotMet": "The order was no longer in the state this step expects, so nothing was changed.",
    "automations.failure.unsure": "We cannot be sure whether this step already happened. Check the order or the chat before you retry.",
    "automations.failure.interrupted": "The app was closed or restarted during this step. It is safe to retry.",
    "automations.failure.exhausted": "It failed several times in a row and was stopped.",
    "automations.failure.other": "An unexpected problem. The technical code is under Details.",
    "automations.hold": "Pause this automation",
    "automations.holdHint": "New runs stop until you turn it back on. This failed run stays as it is.",
    "automations.holdFailed": "Could not pause it. Try again.",
    "automations.notFound.title": "This automation was not found",
    "automations.notFound.message": "It may have been deleted, or the link is old. Your other automations are untouched.",
    "automations.notFound.back": "Back to automations",
  },
};

export function getDashboardStatesRuntimeTranslation(locale: Locale, key: string): string | undefined {
  return translations[locale]?.[key];
}
