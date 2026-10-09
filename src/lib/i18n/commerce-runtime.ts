import type { Locale } from "@/lib/i18n";

const translations: Record<Locale, Record<string, string>> = {
  en: {
    "commerce.runtime.history": "Sync history",
    "commerce.runtime.subtitle":
      "Provider pages and orders are persisted before processing. Watermarks advance only after complete success.",
    "commerce.runtime.noRuns":
      "No store sync has run yet.",
    "commerce.runtime.refresh": "Refresh history",
    "commerce.runtime.showDetails": "Show details",
    "commerce.runtime.hideDetails": "Hide details",
    "commerce.runtime.counts":
      "{{fetched}} fetched · {{created}} created · {{updated}} updated · {{skipped}} skipped · {{failed}} need attention",
    "commerce.runtime.pages": "Provider pages",
    "commerce.runtime.nextAttempt": "Next attempt",
    "commerce.runtime.retryReason": "Reason for audited retry",
    "commerce.runtime.retryReasonRequired":
      "Enter at least three characters explaining the retry.",
    "commerce.runtime.retry": "Retry safely",
    "commerce.runtime.retryQueued": "The commerce recovery was queued.",
    "commerce.runtime.retryFailed":
      "The commerce recovery could not be queued.",
    "commerce.runtime.retryUnavailable":
      "This run has no fetch or item that can be safely retried.",
    "commerce.runtime.watermarkConflict":
      "The integration watermark changed outside this run. Reconcile the integration state and queue a new sync.",
    "commerce.runtime.credentialDrift":
      "The store connection changed after this sync was queued. Start a new sync.",
    "commerce.runtime.items": "Store orders and attempts",
    "commerce.runtime.attempts": "Attempts",
    "commerce.runtime.sourceOrder": "Provider order",
    "commerce.runtime.queueSuccess": "Commerce synchronization queued",
    "commerce.runtime.queueEmpty":
      "No configured commerce platform was available to queue.",
    "commerce.runtime.state.queued": "Queued",
    "commerce.runtime.state.fetching": "Fetching provider page",
    "commerce.runtime.state.processing": "Processing",
    "commerce.runtime.state.retrying": "Retrying",
    "commerce.runtime.state.succeeded": "Succeeded",
    "commerce.runtime.state.partially_completed": "Partially completed",
    "commerce.runtime.state.quarantined": "Quarantined",
    "commerce.runtime.state.dead_letter": "Dead letter",
    "commerce.runtime.state.skipped": "Skipped",
    "commerce.runtime.state.cancelled": "Cancelled",
    "commerce.runtime.state.lease_expired": "Lease expired",
    "commerce.runtime.state.failed": "Failed",
  },
  fr: {
    "commerce.runtime.history":
      "Historique des synchronisations",
    "commerce.runtime.subtitle":
      "Les pages et commandes fournisseur sont persistées avant traitement. Le point de reprise n’avance qu’après une réussite complète.",
    "commerce.runtime.noRuns":
      "Aucune synchronisation boutique n’a encore eu lieu.",
    "commerce.runtime.refresh": "Actualiser l’historique",
    "commerce.runtime.showDetails": "Afficher les détails",
    "commerce.runtime.hideDetails": "Masquer les détails",
    "commerce.runtime.counts":
      "{{fetched}} récupérée(s) · {{created}} créée(s) · {{updated}} mise(s) à jour · {{skipped}} ignorée(s) · {{failed}} à traiter",
    "commerce.runtime.pages": "Pages fournisseur",
    "commerce.runtime.nextAttempt": "Prochaine tentative",
    "commerce.runtime.retryReason": "Motif de la nouvelle tentative auditée",
    "commerce.runtime.retryReasonRequired":
      "Saisissez au moins trois caractères pour expliquer la nouvelle tentative.",
    "commerce.runtime.retry": "Réessayer en sécurité",
    "commerce.runtime.retryQueued":
      "La récupération e-commerce a été mise en file.",
    "commerce.runtime.retryFailed":
      "La récupération e-commerce n’a pas pu être mise en file.",
    "commerce.runtime.retryUnavailable":
      "Cette exécution ne contient aucune récupération de page ou commande sûre.",
    "commerce.runtime.watermarkConflict":
      "Le point de reprise de l’intégration a changé hors de cette exécution. Réconciliez l’intégration puis lancez une nouvelle synchronisation.",
    "commerce.runtime.credentialDrift":
      "La connexion de la boutique a changé après la mise en file de cette synchronisation. Lancez une nouvelle synchronisation.",
    "commerce.runtime.items": "Commandes boutique et tentatives",
    "commerce.runtime.attempts": "Tentatives",
    "commerce.runtime.sourceOrder": "Commande fournisseur",
    "commerce.runtime.queueSuccess": "Synchronisation e-commerce mise en file",
    "commerce.runtime.queueEmpty":
      "Aucune plateforme e-commerce configurée ne pouvait être mise en file.",
    "commerce.runtime.state.queued": "En file",
    "commerce.runtime.state.fetching": "Récupération d’une page fournisseur",
    "commerce.runtime.state.processing": "En cours",
    "commerce.runtime.state.retrying": "Nouvelle tentative",
    "commerce.runtime.state.succeeded": "Réussie",
    "commerce.runtime.state.partially_completed": "Partiellement terminée",
    "commerce.runtime.state.quarantined": "En quarantaine",
    "commerce.runtime.state.dead_letter": "Lettre morte",
    "commerce.runtime.state.skipped": "Ignorée",
    "commerce.runtime.state.cancelled": "Annulée",
    "commerce.runtime.state.lease_expired": "Bail expiré",
    "commerce.runtime.state.failed": "Échouée",
  },
  ar: {
    "commerce.runtime.history": "سجل المزامنة",
    "commerce.runtime.subtitle":
      "تُحفظ صفحات وطلبات المزود قبل المعالجة، ولا تتقدم نقطة المزامنة إلا بعد النجاح الكامل.",
    "commerce.runtime.noRuns":
      "لم تتم أي مزامنة للمتجر بعد.",
    "commerce.runtime.refresh": "تحديث السجل",
    "commerce.runtime.showDetails": "عرض التفاصيل",
    "commerce.runtime.hideDetails": "إخفاء التفاصيل",
    "commerce.runtime.counts":
      "تم جلب {{fetched}} · إنشاء {{created}} · تحديث {{updated}} · تخطي {{skipped}} · يحتاج {{failed}} إلى مراجعة",
    "commerce.runtime.pages": "صفحات المزود",
    "commerce.runtime.nextAttempt": "المحاولة التالية",
    "commerce.runtime.retryReason": "سبب إعادة المحاولة الموثقة",
    "commerce.runtime.retryReasonRequired":
      "اكتب ثلاثة أحرف على الأقل لتوضيح سبب إعادة المحاولة.",
    "commerce.runtime.retry": "إعادة محاولة آمنة",
    "commerce.runtime.retryQueued":
      "تمت إضافة استرداد المزامنة إلى قائمة الانتظار.",
    "commerce.runtime.retryFailed":
      "تعذر إضافة استرداد المزامنة إلى قائمة الانتظار.",
    "commerce.runtime.retryUnavailable":
      "لا توجد صفحة أو معاملة مزود يمكن إعادة محاولتها بأمان في هذا التشغيل.",
    "commerce.runtime.watermarkConflict":
      "تغيرت نقطة المزامنة خارج هذا التشغيل. قم بتسوية حالة التكامل ثم ابدأ مزامنة جديدة.",
    "commerce.runtime.credentialDrift":
      "تغيّر اتصال المتجر بعد جدولة هذه المزامنة. ابدأ مزامنة جديدة.",
    "commerce.runtime.items": "طلبات المتجر والمحاولات",
    "commerce.runtime.attempts": "المحاولات",
    "commerce.runtime.sourceOrder": "طلب المزود",
    "commerce.runtime.queueSuccess":
      "تمت إضافة مزامنة التجارة الإلكترونية إلى قائمة الانتظار",
    "commerce.runtime.queueEmpty":
      "لا توجد منصة تجارة إلكترونية مهيأة يمكن إضافتها إلى قائمة الانتظار.",
    "commerce.runtime.state.queued": "في قائمة الانتظار",
    "commerce.runtime.state.fetching": "جلب صفحة المزود",
    "commerce.runtime.state.processing": "قيد المعالجة",
    "commerce.runtime.state.retrying": "قيد إعادة المحاولة",
    "commerce.runtime.state.succeeded": "نجح",
    "commerce.runtime.state.partially_completed": "اكتمل جزئيا",
    "commerce.runtime.state.quarantined": "قيد الحجر",
    "commerce.runtime.state.dead_letter": "متعذر نهائيا",
    "commerce.runtime.state.skipped": "تم التخطي",
    "commerce.runtime.state.cancelled": "ملغى",
    "commerce.runtime.state.lease_expired": "انتهت مهلة الحجز",
    "commerce.runtime.state.failed": "فشل",
  },
};

export function getCommerceRuntimeTranslation(
  locale: Locale,
  key: string,
): string | undefined {
  return translations[locale][key];
}
