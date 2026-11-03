import type { Locale } from "@/lib/i18n";

/**
 * Runtime catalog for the inbox "Sample" marking and the remove-sample-data
 * control (F-0030). ar/fr/en together; Arabic is a helper draft the Founder
 * reads. The counts in the confirm dialog are printed one per line, so no
 * plural form is needed.
 */
const translations: Record<Locale, Record<string, string>> = {
  en: {
    "inbox.sample.badge": "Sample",
    "inbox.sample.badgeHint": "Sample data, not a real customer",
    "inbox.sample.mixed": "Sample data is mixed with your real data.",
    "inbox.sample.only": "These conversations are sample data.",
    "inbox.sample.remove": "Remove sample data",
    "inbox.sample.confirmTitle": "Remove sample data?",
    "inbox.sample.confirmIntro":
      "This permanently deletes only the rows marked Sample. Your real data is not touched.",
    "inbox.sample.count.conversations": "Conversations: {{count}}",
    "inbox.sample.count.orders": "Orders: {{count}}",
    "inbox.sample.count.customers": "Customers: {{count}}",
    "inbox.sample.count.products": "Products: {{count}}",
    "inbox.sample.removed": "Sample data removed.",
    "inbox.sample.blocked":
      "Sample data is still used by real records, so nothing was deleted. Move or remove those records first.",
    "inbox.sample.failed": "Sample data could not be removed. Try again.",
  },
  fr: {
    "inbox.sample.badge": "Exemple",
    "inbox.sample.badgeHint": "Donnée d'exemple, pas un vrai client",
    "inbox.sample.mixed": "Des données d'exemple sont mélangées à vos données réelles.",
    "inbox.sample.only": "Ces conversations sont des données d'exemple.",
    "inbox.sample.remove": "Supprimer les données d'exemple",
    "inbox.sample.confirmTitle": "Supprimer les données d'exemple ?",
    "inbox.sample.confirmIntro":
      "Seules les lignes marquées Exemple sont supprimées, définitivement. Vos données réelles ne sont pas touchées.",
    "inbox.sample.count.conversations": "Conversations : {{count}}",
    "inbox.sample.count.orders": "Commandes : {{count}}",
    "inbox.sample.count.customers": "Clients : {{count}}",
    "inbox.sample.count.products": "Produits : {{count}}",
    "inbox.sample.removed": "Données d'exemple supprimées.",
    "inbox.sample.blocked":
      "Des enregistrements réels utilisent encore les données d'exemple : rien n'a été supprimé. Déplacez ou supprimez d'abord ces enregistrements.",
    "inbox.sample.failed": "Impossible de supprimer les données d'exemple. Réessayez.",
  },
  ar: {
    "inbox.sample.badge": "مثال",
    "inbox.sample.badgeHint": "بيانات مثال وليست زبونًا حقيقيًا",
    "inbox.sample.mixed": "بيانات المثال مختلطة ببياناتك الحقيقية.",
    "inbox.sample.only": "هذه المحادثات بيانات مثال.",
    "inbox.sample.remove": "حذف بيانات المثال",
    "inbox.sample.confirmTitle": "حذف بيانات المثال؟",
    "inbox.sample.confirmIntro":
      "سيُحذف نهائيًا فقط ما هو معلَّم «مثال». بياناتك الحقيقية لن تُمَسّ.",
    "inbox.sample.count.conversations": "المحادثات: {{count}}",
    "inbox.sample.count.orders": "الطلبات: {{count}}",
    "inbox.sample.count.customers": "الزبائن: {{count}}",
    "inbox.sample.count.products": "المنتجات: {{count}}",
    "inbox.sample.removed": "تم حذف بيانات المثال.",
    "inbox.sample.blocked":
      "ما زالت سجلات حقيقية تستخدم بيانات المثال، لذلك لم يُحذف شيء. انقل تلك السجلات أو احذفها أولاً.",
    "inbox.sample.failed": "تعذّر حذف بيانات المثال. أعد المحاولة.",
  },
};

export function getInboxSampleRuntimeTranslation(
  locale: Locale,
  key: string,
): string | undefined {
  return translations[locale][key];
}
