import type { Locale } from "@/lib/i18n";

const whatsappRecoveryTranslations: Record<Locale, Record<string, string>> = {
  en: {
    "inbox.whatsappAmbiguous":
      "WhatsApp may have accepted this message, but SahelFlow could not confirm the receipt.",
    "inbox.whatsappAmbiguousRetryWarning":
      "WhatsApp may already have this message. Retrying can send a duplicate. Continue?",
  },
  fr: {
    "inbox.whatsappAmbiguous":
      "WhatsApp a peut-être accepté ce message, mais SahelFlow n’a pas pu confirmer le reçu.",
    "inbox.whatsappAmbiguousRetryWarning":
      "WhatsApp possède peut-être déjà ce message. Réessayer peut envoyer un doublon. Continuer ?",
  },
  ar: {
    "inbox.whatsappAmbiguous":
      "قد يكون واتساب قد استلم هذه الرسالة، لكن تعذر على SahelFlow تأكيد الإيصال.",
    "inbox.whatsappAmbiguousRetryWarning":
      "قد تكون الرسالة قد أُرسلت بالفعل إلى واتساب. قد تؤدي إعادة المحاولة إلى إرسال نسخة مكررة. هل تريد المتابعة؟",
  },
};

export function getWhatsAppRecoveryTranslation(
  locale: Locale,
  key: string,
): string | undefined {
  return whatsappRecoveryTranslations[locale][key];
}