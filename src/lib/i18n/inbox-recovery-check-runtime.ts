import type { Locale } from "@/lib/i18n";

/**
 * The line the recovery dock shows when it could not look for messages that
 * need attention. It says "cannot be checked", never "all clear" and never
 * "delivered". Same keys in ar, fr and en.
 */
const translations: Record<Locale, Record<string, string>> = {
  ar: {
    "inboxRecoveryCheck.title": "تعذّر التحقق من الرسائل التي تحتاج إلى مراجعة الآن",
    "inboxRecoveryCheck.hint":
      "ستتكرر المحاولة تلقائياً. إلى أن ينجح الفحص، لا يعني هدوء الصندوق أن كل شيء بخير.",
    "inboxRecoveryCheck.again": "إعادة الفحص",
  },
  fr: {
    "inboxRecoveryCheck.title": "Impossible de vérifier les messages à traiter pour le moment",
    "inboxRecoveryCheck.hint":
      "Nouvel essai automatique. Tant que la vérification échoue, une boîte calme ne prouve pas que tout va bien.",
    "inboxRecoveryCheck.again": "Vérifier à nouveau",
  },
  en: {
    "inboxRecoveryCheck.title": "Messages needing attention cannot be checked right now",
    "inboxRecoveryCheck.hint":
      "It will try again by itself. Until the check works, a quiet inbox does not prove that everything is fine.",
    "inboxRecoveryCheck.again": "Check again",
  },
};

export function getInboxRecoveryCheckRuntimeTranslation(
  locale: Locale,
  key: string,
): string | undefined {
  return translations[locale]?.[key];
}
