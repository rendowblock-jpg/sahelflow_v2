import type { Locale } from "@/lib/i18n";

/**
 * Runtime copy for a WhatsApp send the guard held (the same text went to many
 * chats). {{count}} is the number of OTHER chats that already got the text.
 */
const translations: Record<Locale, Record<string, string>> = {
  en: {
    "whatsapp.heldSend.label": "Held to protect your number",
    "whatsapp.heldSend.explain": "This message has not been sent.",
    "whatsapp.heldSend.approve": "Send anyway",
    "whatsapp.heldSend.askOwner": "Ask the shop owner to release it",
    "whatsapp.heldSend.dialogTitle": "Send this message anyway?",
    "whatsapp.heldSend.dialogBody": "The same text just went to {{count}} other chats. WhatsApp may read it as spam and restrict your number.",
    "whatsapp.heldSend.dialogConfirm": "Send anyway",
    "whatsapp.heldSend.dialogCancel": "Keep on hold",
    "whatsapp.heldSend.approveFailed": "Could not release this message. Try again.",
    "whatsapp.heldSend.ownerOnly": "Only the shop owner can release a held message.",
  },
  fr: {
    "whatsapp.heldSend.label": "Retenu pour protéger votre numéro",
    "whatsapp.heldSend.explain": "Ce message n’a pas été envoyé.",
    "whatsapp.heldSend.approve": "Envoyer quand même",
    "whatsapp.heldSend.askOwner": "Demandez au propriétaire de la boutique de le libérer",
    "whatsapp.heldSend.dialogTitle": "Envoyer ce message quand même ?",
    "whatsapp.heldSend.dialogBody": "Le même texte vient d’être envoyé à {{count}} autres discussions. WhatsApp peut le prendre pour du spam et restreindre votre numéro.",
    "whatsapp.heldSend.dialogConfirm": "Envoyer quand même",
    "whatsapp.heldSend.dialogCancel": "Garder en attente",
    "whatsapp.heldSend.approveFailed": "Impossible de libérer ce message. Réessayez.",
    "whatsapp.heldSend.ownerOnly": "Seul le propriétaire de la boutique peut libérer un message retenu.",
  },
  ar: {
    "whatsapp.heldSend.label": "محجوزة لحماية رقمك",
    "whatsapp.heldSend.explain": "لم تُرسل هذه الرسالة بعد.",
    "whatsapp.heldSend.approve": "أرسلها رغم ذلك",
    "whatsapp.heldSend.askOwner": "اطلب من صاحب المتجر إطلاقها",
    "whatsapp.heldSend.dialogTitle": "هل تريد إرسال هذه الرسالة رغم ذلك؟",
    "whatsapp.heldSend.dialogBody": "النص نفسه وصل للتو إلى {{count}} محادثات أخرى. قد يعدّه واتساب رسائل مزعجة ويقيّد رقمك.",
    "whatsapp.heldSend.dialogConfirm": "أرسلها رغم ذلك",
    "whatsapp.heldSend.dialogCancel": "أبقِها محجوزة",
    "whatsapp.heldSend.approveFailed": "تعذّر إطلاق هذه الرسالة. حاول مرة أخرى.",
    "whatsapp.heldSend.ownerOnly": "صاحب المتجر وحده يمكنه إطلاق رسالة محجوزة.",
  },
};

export function getHeldSendRuntimeTranslation(locale: Locale, key: string): string | undefined {
  return translations[locale][key];
}
