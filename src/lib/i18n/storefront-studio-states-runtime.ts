import type { Locale } from "@/lib/i18n";

/**
 * Copy for the states of the store management pages and the Studio: release
 * history, the new-store form, Studio start-up, publishing, unsaved work and
 * missing photos. Wording follows what is true today: nothing here says a
 * store is live, that photos are hosted, or that ads and pixels work.
 */
const translations: Record<Locale, Record<string, string>> = {
  en: {
    "storefront.studioStates.history.loadFailedTitle": "Release history did not load",
    "storefront.studioStates.history.loadFailedBody": "Nothing was changed: your store and your draft are as they were. Check your connection and try again.",
    "storefront.studioStates.history.staleTitle": "Could not refresh. Showing the history loaded earlier.",
    "storefront.studioStates.history.emptyTitle": "No published versions yet",
    "storefront.studioStates.history.emptyBody": "Each time you publish from the Studio, that version is kept here so you can go back to it.",
    "storefront.studioStates.history.openStudio": "Open the Studio",
    "storefront.studioStates.history.notConnectedTitle": "Not published online yet",
    "storefront.studioStates.history.notConnectedBody": "Versions are kept by the SahelFlow online service. Until this store is published online, there is no history to go back to.",
    "storefront.studioStates.history.refresh": "Refresh history",
    "storefront.studioStates.history.rollbackAria": "Go back to {{release}}",
    "storefront.studioStates.history.rollbackTitle": "Go back to this version?",
    "storefront.studioStates.history.rollbackBody": "{{release}} will be published again as a new version. Your Studio draft is not changed and no version is deleted.",
    "storefront.studioStates.history.rollbackConfirm": "Go back to this version",
    "storefront.studioStates.history.rollbackCancel": "Keep the current version",
    "storefront.studioStates.history.rollbackFailed": "Could not go back. The published version was not changed. Try again.",
    "storefront.studioStates.history.rollbackConflict": "The published version changed while this page was open. The history was reloaded: check it, then try again.",
    "storefront.studioStates.history.rollbackUnknown": "No answer from the server, so we cannot tell whether the published version changed. The history is being reloaded: check it before trying again.",
  },
  fr: {
    "storefront.studioStates.history.loadFailedTitle": "L’historique des versions ne s’est pas chargé",
    "storefront.studioStates.history.loadFailedBody": "Rien n’a été modifié : votre boutique et votre brouillon sont intacts. Vérifiez votre connexion et réessayez.",
    "storefront.studioStates.history.staleTitle": "Actualisation impossible. L’historique affiché date du dernier chargement.",
    "storefront.studioStates.history.emptyTitle": "Aucune version publiée pour l’instant",
    "storefront.studioStates.history.emptyBody": "Chaque fois que vous publiez depuis le Studio, la version est conservée ici pour que vous puissiez y revenir.",
    "storefront.studioStates.history.openStudio": "Ouvrir le Studio",
    "storefront.studioStates.history.notConnectedTitle": "Pas encore publiée en ligne",
    "storefront.studioStates.history.notConnectedBody": "Les versions sont conservées par le service en ligne SahelFlow. Tant que cette boutique n’est pas publiée en ligne, il n’y a pas d’historique à restaurer.",
    "storefront.studioStates.history.refresh": "Actualiser l’historique",
    "storefront.studioStates.history.rollbackAria": "Revenir à {{release}}",
    "storefront.studioStates.history.rollbackTitle": "Revenir à cette version ?",
    "storefront.studioStates.history.rollbackBody": "{{release}} sera publiée à nouveau comme nouvelle version. Votre brouillon du Studio n’est pas modifié et aucune version n’est supprimée.",
    "storefront.studioStates.history.rollbackConfirm": "Revenir à cette version",
    "storefront.studioStates.history.rollbackCancel": "Garder la version actuelle",
    "storefront.studioStates.history.rollbackFailed": "Retour impossible. La version publiée n’a pas changé. Réessayez.",
    "storefront.studioStates.history.rollbackConflict": "La version publiée a changé pendant que cette page était ouverte. L’historique a été rechargé : vérifiez-le, puis réessayez.",
    "storefront.studioStates.history.rollbackUnknown": "Pas de réponse du serveur : impossible de savoir si la version publiée a changé. L’historique est rechargé, vérifiez-le avant de réessayer.",
  },
  ar: {
    "storefront.studioStates.history.loadFailedTitle": "تعذّر تحميل سجل النسخ",
    "storefront.studioStates.history.loadFailedBody": "لم يتغيّر شيء: متجرك ومسودتك كما هما. تحقق من الاتصال وأعد المحاولة.",
    "storefront.studioStates.history.staleTitle": "تعذّر التحديث. السجل المعروض هو آخر ما تم تحميله.",
    "storefront.studioStates.history.emptyTitle": "لا توجد نسخ منشورة بعد",
    "storefront.studioStates.history.emptyBody": "كل مرة تنشر فيها من الاستوديو تُحفظ النسخة هنا لتتمكن من العودة إليها.",
    "storefront.studioStates.history.openStudio": "افتح الاستوديو",
    "storefront.studioStates.history.notConnectedTitle": "لم يُنشر المتجر على الإنترنت بعد",
    "storefront.studioStates.history.notConnectedBody": "تحفظ خدمة SahelFlow عبر الإنترنت النسخ. وما دام المتجر غير منشور على الإنترنت فلا يوجد سجل للعودة إليه.",
    "storefront.studioStates.history.refresh": "حدّث السجل",
    "storefront.studioStates.history.rollbackAria": "العودة إلى {{release}}",
    "storefront.studioStates.history.rollbackTitle": "العودة إلى هذه النسخة؟",
    "storefront.studioStates.history.rollbackBody": "ستُنشر النسخة {{release}} مرة أخرى كنسخة جديدة. لا تتغيّر مسودتك في الاستوديو ولا تُحذف أي نسخة.",
    "storefront.studioStates.history.rollbackConfirm": "العودة إلى هذه النسخة",
    "storefront.studioStates.history.rollbackCancel": "إبقاء النسخة الحالية",
    "storefront.studioStates.history.rollbackFailed": "تعذّرت العودة. لم تتغيّر النسخة المنشورة. حاول مرة أخرى.",
    "storefront.studioStates.history.rollbackConflict": "تغيّرت النسخة المنشورة أثناء فتح هذه الصفحة. أُعيد تحميل السجل: راجعه ثم حاول مرة أخرى.",
    "storefront.studioStates.history.rollbackUnknown": "لم يصل رد من الخادم، لذا لا نعرف إن كانت النسخة المنشورة قد تغيّرت. يُعاد تحميل السجل، راجعه قبل أن تحاول مرة أخرى.",
  },
};

export const STOREFRONT_STUDIO_STATES_KEYS: readonly string[] = Object.keys(translations.en);

export function getStorefrontStudioStatesRuntimeTranslation(
  locale: Locale,
  key: string,
): string | undefined {
  return translations[locale][key];
}
