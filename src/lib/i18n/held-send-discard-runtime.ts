import type { Locale } from "@/lib/i18n";

/**
 * Runtime copy for DISCARDING a WhatsApp send the guard held (the owner says
 * "do not send this to this chat"). The "Keep on hold" cancel label of the
 * dialog is the existing whatsapp.heldSend.dialogCancel.
 */
const translations: Record<Locale, Record<string, string>> = {
  en: {
    "whatsapp.heldSend.discard": "Discard",
    "whatsapp.heldSend.discardTitle": "Discard this message?",
    "whatsapp.heldSend.discardBody": "This message will not be sent to this chat. The other chats are not affected.",
    "whatsapp.heldSend.discarding": "Discarding…",
    "whatsapp.heldSend.discarded": "Discarded. This message was not sent.",
    "whatsapp.heldSend.discardFailed": "Could not discard this message. Try again.",
    "whatsapp.heldSend.discardOwnerOnly": "Only the shop owner can discard a held message.",
    "whatsapp.heldSend.discardTooLate": "This message was already released, so it cannot be discarded.",
  },
  fr: {
    "whatsapp.heldSend.discard": "Abandonner",
    "whatsapp.heldSend.discardTitle": "Abandonner ce message ?",
    "whatsapp.heldSend.discardBody": "Ce message ne sera pas envoyé à cette discussion. Les autres discussions ne sont pas touchées.",
    "whatsapp.heldSend.discarding": "Abandon en cours…",
    "whatsapp.heldSend.discarded": "Abandonné. Ce message n’a pas été envoyé.",
    "whatsapp.heldSend.discardFailed": "Impossible d’abandonner ce message. Réessayez.",
    "whatsapp.heldSend.discardOwnerOnly": "Seul le propriétaire de la boutique peut abandonner un message retenu.",
    "whatsapp.heldSend.discardTooLate": "Ce message a déjà été libéré : il ne peut plus être abandonné.",
  },
  ar: {
    "whatsapp.heldSend.discard": "إلغاء الإرسال",
    "whatsapp.heldSend.discardTitle": "هل تريد إلغاء إرسال هذه الرسالة؟",
    "whatsapp.heldSend.discardBody": "لن تُرسَل هذه الرسالة إلى هذه المحادثة. لا تتأثر المحادثات الأخرى.",
    "whatsapp.heldSend.discarding": "جارٍ إلغاء الإرسال…",
    "whatsapp.heldSend.discarded": "تم الإلغاء. لم تُرسَل هذه الرسالة.",
    "whatsapp.heldSend.discardFailed": "تعذّر إلغاء إرسال هذه الرسالة. حاول مرة أخرى.",
    "whatsapp.heldSend.discardOwnerOnly": "صاحب المتجر وحده يمكنه إلغاء رسالة محجوزة.",
    "whatsapp.heldSend.discardTooLate": "أُطلقت هذه الرسالة من قبل، لذا لا يمكن إلغاؤها.",
  },
};

export function getHeldSendDiscardRuntimeTranslation(locale: Locale, key: string): string | undefined {
  return translations[locale][key];
}
