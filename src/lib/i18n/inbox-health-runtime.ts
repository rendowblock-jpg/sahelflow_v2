import type { Locale } from "@/lib/i18n";

/**
 * Runtime copy for the inbox reception notices (S05a-03 / S05a-10). Nothing
 * here says "delivered": these are messages that did NOT reach the inbox, or
 * that are still waiting. {{count}} and {{minutes}} are numbers. Arabic uses
 * a count-first form so no plural rule is needed.
 */
const translations: Record<Locale, Record<string, string>> = {
  en: {
    "inboxHealth.lost.one": "1 message could not be received",
    "inboxHealth.lost.other": "{{count}} messages could not be received",
    "inboxHealth.lost.hint":
      "Counted since the app started. They did not reach this inbox: open WhatsApp on your phone to read them, and ask the customer to write again if it matters.",
    "inboxHealth.unsupported.one": "1 message from a group or broadcast list was skipped",
    "inboxHealth.unsupported.other": "{{count}} messages from groups or broadcast lists were skipped",
    "inboxHealth.unsupported.hint":
      "This inbox only shows one-to-one chats. Read those messages in WhatsApp on your phone.",
    "inboxHealth.waiting.one": "1 message is waiting to be received",
    "inboxHealth.waiting.other": "{{count}} messages are waiting to be received",
    "inboxHealth.waiting.hint":
      "They are kept on this PC and the app keeps trying. They are not in the inbox yet.",
    "inboxHealth.waiting.age": "The oldest has waited {{minutes}} min.",
    "inboxHealth.unreachable.title": "Reception cannot be checked right now",
    "inboxHealth.unreachable.hint":
      "The WhatsApp helper on this PC does not answer. New messages may be late. Nothing is shown as received until it answers.",
  },
  fr: {
    "inboxHealth.lost.one": "1 message n’a pas pu être reçu",
    "inboxHealth.lost.other": "{{count}} messages n’ont pas pu être reçus",
    "inboxHealth.lost.hint":
      "Compté depuis le démarrage de l’application. Ils ne sont pas arrivés dans cette boîte : ouvrez WhatsApp sur votre téléphone pour les lire, et demandez au client de réécrire si c’est important.",
    "inboxHealth.unsupported.one": "1 message d’un groupe ou d’une liste de diffusion a été ignoré",
    "inboxHealth.unsupported.other":
      "{{count}} messages de groupes ou de listes de diffusion ont été ignorés",
    "inboxHealth.unsupported.hint":
      "Cette boîte n’affiche que les discussions individuelles. Lisez ces messages dans WhatsApp sur votre téléphone.",
    "inboxHealth.waiting.one": "1 message attend d’être reçu",
    "inboxHealth.waiting.other": "{{count}} messages attendent d’être reçus",
    "inboxHealth.waiting.hint":
      "Ils sont gardés sur ce PC et l’application continue d’essayer. Ils ne sont pas encore dans la boîte.",
    "inboxHealth.waiting.age": "Le plus ancien attend depuis {{minutes}} min.",
    "inboxHealth.unreachable.title": "Impossible de vérifier la réception pour le moment",
    "inboxHealth.unreachable.hint":
      "L’assistant WhatsApp de ce PC ne répond pas. Les nouveaux messages peuvent arriver en retard. Rien n’est affiché comme reçu tant qu’il ne répond pas.",
  },
  ar: {
    "inboxHealth.lost.one": "تعذّر استلام رسالة واحدة",
    "inboxHealth.lost.other": "رسائل تعذّر استلامها: {{count}}",
    "inboxHealth.lost.hint":
      "العدد منذ تشغيل التطبيق. لم تصل هذه الرسائل إلى صندوق الوارد: افتح واتساب على هاتفك لقراءتها، واطلب من الزبون أن يكتب مجدداً إن كان الأمر مهماً.",
    "inboxHealth.unsupported.one": "تم تخطي رسالة واحدة من مجموعة أو قائمة بث",
    "inboxHealth.unsupported.other": "رسائل من مجموعات أو قوائم بث تم تخطيها: {{count}}",
    "inboxHealth.unsupported.hint":
      "يعرض هذا الصندوق المحادثات الفردية فقط. اقرأ هذه الرسائل في واتساب على هاتفك.",
    "inboxHealth.waiting.one": "رسالة واحدة تنتظر الاستلام",
    "inboxHealth.waiting.other": "رسائل تنتظر الاستلام: {{count}}",
    "inboxHealth.waiting.hint":
      "هي محفوظة على هذا الحاسوب والتطبيق يواصل المحاولة. لم تظهر في الصندوق بعد.",
    "inboxHealth.waiting.age": "أقدمها تنتظر منذ {{minutes}} دقيقة.",
    "inboxHealth.unreachable.title": "تعذّر التحقق من الاستلام الآن",
    "inboxHealth.unreachable.hint":
      "مساعد واتساب على هذا الحاسوب لا يرد. قد تتأخر الرسائل الجديدة. لا يُعرض شيء على أنه وصل قبل أن يرد.",
  },
};

export function getInboxHealthRuntimeTranslation(locale: Locale, key: string): string | undefined {
  return translations[locale][key];
}
