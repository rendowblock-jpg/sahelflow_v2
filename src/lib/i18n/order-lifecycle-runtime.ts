import type { Locale } from "@/lib/i18n";

/**
 * Runtime dictionary for the order-detail lifecycle rail (R3-a).
 *
 * One visible lifecycle rail replaces the former dual action cards (legacy
 * OrderStatusActions vs canonical governed commands). Labels shared with the
 * confirmation queue or the governed fulfillment workspace reuse the existing
 * keys (confirmationQueue.*, orders.workspace.*) so both surfaces stay in copy
 * lockstep; only rail-specific copy ships here. Keys are candidates for
 * promotion into src/lib/i18n/locales/*.json during the central locale pass.
 *
 * Reused keys (NOT duplicated here): orders.status.pending/confirmed/shipped/
 * delivered, orders.statusActions.packed/updated/noActions/finalStatus,
 * orders.workspace.decision.* (confirm/reject/submitDraft/authority/
 * importAuthority/importBlocked), orders.workspace.fulfillment.action.pack/
 * ship/deliver + heading + axis.* + state.* + committed/replayed,
 * confirmationQueue.reject.* quick-picks + legacyHint,
 * confirmationQueue.toast.confirmed/rejected, common.cancel.
 */
const translations: Record<Locale, Record<string, string>> = {
  en: {
    "orderLifecycle.stepsLabel": "Order journey",
    "orderLifecycle.nextActions": "Next actions",
    "orderLifecycle.authority.legacy": "Legacy status authority",
    "orderLifecycle.moreActions": "More actions",
    "orderLifecycle.viewTimeline": "View timeline",
    "orderLifecycle.substate.updated": "Updated {{time}}",
    "orderLifecycle.cancel.popoverTitle": "Cancel {{number}}",
    "orderLifecycle.cancel.submit": "Cancel order",
    "orderLifecycle.aux.heading": "Courier, returns and COD",
  },
  fr: {
    "orderLifecycle.stepsLabel": "Parcours de la commande",
    "orderLifecycle.nextActions": "Prochaines actions",
    "orderLifecycle.authority.legacy": "Autorité de statut historique",
    "orderLifecycle.moreActions": "Autres actions",
    "orderLifecycle.viewTimeline": "Voir le suivi",
    "orderLifecycle.substate.updated": "Mis à jour {{time}}",
    "orderLifecycle.cancel.popoverTitle": "Annuler {{number}}",
    "orderLifecycle.cancel.submit": "Annuler la commande",
    "orderLifecycle.aux.heading": "Transporteur, retours et COD",
  },
  ar: {
    "orderLifecycle.stepsLabel": "مسار الطلبية",
    "orderLifecycle.nextActions": "الإجراءات التالية",
    "orderLifecycle.authority.legacy": "صلاحية حالة تقليدية",
    "orderLifecycle.moreActions": "إجراءات أخرى",
    "orderLifecycle.viewTimeline": "عرض المسار",
    "orderLifecycle.substate.updated": "آخر تحديث {{time}}",
    "orderLifecycle.cancel.popoverTitle": "إلغاء {{number}}",
    "orderLifecycle.cancel.submit": "إلغاء الطلبية",
    "orderLifecycle.aux.heading": "الناقل والإرجاع والدفع عند الاستلام",
  },
};

export function getOrderLifecycleRuntimeTranslation(
  locale: Locale,
  key: string,
): string | undefined {
  return translations[locale][key];
}
