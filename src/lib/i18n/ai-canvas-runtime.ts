import type { Locale } from "@/lib/i18n";

/**
 * Runtime dictionary for the R4-e AI canvas upgrade (markdown rendering,
 * regenerate, session rename/delete, contextual "Ask AI" deep links from
 * order and customer record surfaces).
 *
 * The AI workspace's typed copy dicts (ai-workspace.ts,
 * ai-decision-workspace.ts) stay authoritative for their existing keys;
 * only R4-e-owned copy ships here. Keys are candidates for promotion into
 * the locale JSON bundle during the central locale pass (locales/*.json
 * are PR #355-owned).
 */
const translations: Record<Locale, Record<string, string>> = {
  en: {
    "ai.ask.button": "Ask AI",
    "ai.ask.orderPrompt":
      "About order {{orderNumber}}: review its current state, confirmation and delivery progress, and any risk signals. Tell me what needs attention next, using my real shop data only.",
    "ai.ask.customerPrompt":
      "About the customer {{name}}: review their order history, delivery performance and risk signals. Tell me what needs attention next, using my real shop data only.",
    "ai.canvas.regenerate": "Regenerate",
    "ai.history.rename": "Rename session",
    "ai.history.renameSave": "Save the new name",
    "ai.history.renameCancel": "Cancel renaming",
    "ai.history.delete": "Delete session",
    "ai.history.deleteConfirm": "Click again to confirm deleting this session",
    "ai.history.renameFailed": "This session could not be renamed.",
    "ai.history.deleteFailed": "This session could not be deleted.",
  },
  fr: {
    "ai.ask.button": "Demander à l’IA",
    "ai.ask.orderPrompt":
      "À propos de la commande {{orderNumber}} : examine son état actuel, l’avancement de la confirmation et de la livraison, ainsi que les signaux de risque. Dis-moi ce qui demande attention ensuite, en n’utilisant que mes données réelles.",
    "ai.ask.customerPrompt":
      "À propos du client {{name}} : examine son historique de commandes, sa performance de livraison et ses signaux de risque. Dis-moi ce qui demande attention ensuite, en n’utilisant que mes données réelles.",
    "ai.canvas.regenerate": "Régénérer",
    "ai.history.rename": "Renommer la session",
    "ai.history.renameSave": "Enregistrer le nouveau nom",
    "ai.history.renameCancel": "Annuler le renommage",
    "ai.history.delete": "Supprimer la session",
    "ai.history.deleteConfirm":
      "Cliquez à nouveau pour confirmer la suppression de cette session",
    "ai.history.renameFailed": "Impossible de renommer cette session.",
    "ai.history.deleteFailed": "Impossible de supprimer cette session.",
  },
  ar: {
    "ai.ask.button": "اسأل الذكاء الاصطناعي",
    "ai.ask.orderPrompt":
      "بخصوص الطلب {{orderNumber}}: راجع حالته الحالية وتقدم التأكيد والتوصيل وأي إشارات مخاطر. أخبرني بما يحتاج إلى اهتمام تالياً، باستخدام بيانات متجري الحقيقية فقط.",
    "ai.ask.customerPrompt":
      "بخصوص العميل {{name}}: راجع سجل طلباته وأداء التوصيل وإشارات المخاطر لديه. أخبرني بما يحتاج إلى اهتمام تالياً، باستخدام بيانات متجري الحقيقية فقط.",
    "ai.canvas.regenerate": "إعادة التوليد",
    "ai.history.rename": "إعادة تسمية الجلسة",
    "ai.history.renameSave": "حفظ الاسم الجديد",
    "ai.history.renameCancel": "إلغاء إعادة التسمية",
    "ai.history.delete": "حذف الجلسة",
    "ai.history.deleteConfirm": "انقر مرة أخرى لتأكيد حذف هذه الجلسة",
    "ai.history.renameFailed": "تعذرت إعادة تسمية هذه الجلسة.",
    "ai.history.deleteFailed": "تعذر حذف هذه الجلسة.",
  },
};

export function getAiCanvasRuntimeTranslation(
  locale: Locale,
  key: string,
): string | undefined {
  return translations[locale][key];
}
