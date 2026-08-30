import type { Locale } from "@/lib/i18n";

/**
 * Runtime dictionary for the confirmation-queue fast path (R2-b).
 *
 * The confirmation queue is the highest-frequency COD workflow; its inline
 * confirm/reject actions, bulk bar, rejection quick-picks, 60-minute SLA
 * indicator and all-caught-up state ship here so they resolve immediately in
 * ar/fr/en. Keys are candidates for promotion into
 * src/lib/i18n/locales/*.json during the central locale pass.
 *
 * Reused static keys (NOT duplicated here): orders.workspace.decision.reasonLabel,
 * orders.workspace.decision.reasonPlaceholder, orders.workspace.confirmation.review,
 * orders.confirmSelected, orders.bulkSuccess, orders.bulkPartial,
 * orders.statusActions.updateFailed, common.cancel.
 */
const translations: Record<Locale, Record<string, string>> = {
  en: {
    "confirmationQueue.inline.confirm": "Confirm order",
    "confirmationQueue.inline.reject": "Reject order",
    "confirmationQueue.reject.popoverTitle": "Reject {{number}}",
    "confirmationQueue.reject.quickPicksLabel": "Quick reasons",
    "confirmationQueue.reject.reason.customerCancelled": "Cancelled by customer",
    "confirmationQueue.reject.reason.fakeOrder": "Fake order",
    "confirmationQueue.reject.reason.unreachable": "Unreachable",
    "confirmationQueue.reject.reason.postponed": "Postponed",
    "confirmationQueue.reject.submit": "Reject order",
    "confirmationQueue.reject.legacyHint":
      "This legacy order records the cancellation only; rejection reasons are stored on governed orders.",
    "confirmationQueue.bulk.rejectSelected": "Reject Selected",
    "confirmationQueue.bulk.rejectTitle": "Reject {{count}} orders",
    "confirmationQueue.bulk.blockedReason":
      "Confirmation blocked (imported order)",
    "confirmationQueue.sla.overdue":
      "Over 60 minutes old — confirm now to cut refusal risk",
    "confirmationQueue.toast.confirmed": "Order {{number}} confirmed",
    "confirmationQueue.toast.rejected": "Order {{number}} rejected",
    "confirmationQueue.empty.slaMet":
      "Every pending order is confirmed — the 60-minute SLA is met.",
    "confirmationQueue.empty.autoRefresh":
      "New pending orders appear automatically; this queue refreshes every 30 seconds.",
    "confirmationQueue.header.pendingCount": "{{count}} pending",
  },
  fr: {
    "confirmationQueue.inline.confirm": "Confirmer la commande",
    "confirmationQueue.inline.reject": "Refuser la commande",
    "confirmationQueue.reject.popoverTitle": "Refuser {{number}}",
    "confirmationQueue.reject.quickPicksLabel": "Motifs rapides",
    "confirmationQueue.reject.reason.customerCancelled": "Annulé par le client",
    "confirmationQueue.reject.reason.fakeOrder": "Fausse commande",
    "confirmationQueue.reject.reason.unreachable": "Injoignable",
    "confirmationQueue.reject.reason.postponed": "Reporté",
    "confirmationQueue.reject.submit": "Refuser la commande",
    "confirmationQueue.reject.legacyHint":
      "Cette commande historique enregistre l’annulation uniquement ; les motifs de refus sont conservés sur les commandes gouvernées.",
    "confirmationQueue.bulk.rejectSelected": "Refuser la sélection",
    "confirmationQueue.bulk.rejectTitle": "Refuser {{count}} commandes",
    "confirmationQueue.bulk.blockedReason":
      "Confirmation bloquée (commande importée)",
    "confirmationQueue.sla.overdue":
      "Plus de 60 minutes — confirmez maintenant pour réduire le risque de refus",
    "confirmationQueue.toast.confirmed": "Commande {{number}} confirmée",
    "confirmationQueue.toast.rejected": "Commande {{number}} refusée",
    "confirmationQueue.empty.slaMet":
      "Toutes les commandes en attente sont confirmées — le SLA de 60 minutes est respecté.",
    "confirmationQueue.empty.autoRefresh":
      "Les nouvelles commandes apparaissent automatiquement ; la file s’actualise toutes les 30 secondes.",
    "confirmationQueue.header.pendingCount": "{{count}} en attente",
  },
  ar: {
    "confirmationQueue.inline.confirm": "تأكيد الطلبية",
    "confirmationQueue.inline.reject": "رفض الطلبية",
    "confirmationQueue.reject.popoverTitle": "رفض {{number}}",
    "confirmationQueue.reject.quickPicksLabel": "أسباب سريعة",
    "confirmationQueue.reject.reason.customerCancelled": "ألغاها العميل",
    "confirmationQueue.reject.reason.fakeOrder": "طلبية وهمية",
    "confirmationQueue.reject.reason.unreachable": "لا يمكن الوصول إليه",
    "confirmationQueue.reject.reason.postponed": "مؤجلة",
    "confirmationQueue.reject.submit": "رفض الطلبية",
    "confirmationQueue.reject.legacyHint":
      "هذه الطلبية القديمة تسجل الإلغاء فقط؛ تُحفظ أسباب الرفض على الطلبيات المعتمدة.",
    "confirmationQueue.bulk.rejectSelected": "رفض المحدد",
    "confirmationQueue.bulk.rejectTitle": "رفض {{count}} طلبيات",
    "confirmationQueue.bulk.blockedReason": "التأكيد محجوب (طلبية مستوردة)",
    "confirmationQueue.sla.overdue":
      "مرّ أكثر من 60 دقيقة — أكّدها الآن لتقليل خطر الرفض",
    "confirmationQueue.toast.confirmed": "تم تأكيد الطلبية {{number}}",
    "confirmationQueue.toast.rejected": "تم رفض الطلبية {{number}}",
    "confirmationQueue.empty.slaMet":
      "كل الطلبيات المعلقة مؤكدة — تم الالتزام بمهلة الـ60 دقيقة.",
    "confirmationQueue.empty.autoRefresh":
      "تظهر الطلبيات الجديدة تلقائيًا؛ يتحدّث هذا الطابور كل 30 ثانية.",
    "confirmationQueue.header.pendingCount": "{{count}} قيد الانتظار",
  },
};

export function getConfirmationQueueRuntimeTranslation(
  locale: Locale,
  key: string,
): string | undefined {
  return translations[locale][key];
}
