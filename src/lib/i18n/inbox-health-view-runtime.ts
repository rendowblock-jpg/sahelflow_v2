import type { Locale } from "@/lib/i18n";

/**
 * Runtime copy for the "connected but silent" parts of the inbox (w211):
 * the grey last-message note, the stalled notice with its Reconnect button,
 * and the OK on the red notice. Plain and short, the same meaning in all three.
 * {{hours}} and {{days}} are whole numbers.
 */
const translations: Record<Locale, Record<string, string>> = {
  en: {
    "inboxHealth.silent.hours": "Last customer message: {{hours}} h ago",
    "inboxHealth.silent.days": "Last customer message: {{days}} d ago",
    "inboxHealth.stalled.title": "Messages may not be arriving",
    "inboxHealth.stalled.hint":
      "WhatsApp looks connected, but messages are stuck on this PC and not reaching the inbox. Press Reconnect to try again.",
    "inboxHealth.stalled.reconnect": "Reconnect",
    "inboxHealth.ack": "OK",
  },
  fr: {
    "inboxHealth.silent.hours": "Dernier message client : il y a {{hours}} h",
    "inboxHealth.silent.days": "Dernier message client : il y a {{days}} j",
    "inboxHealth.stalled.title": "Les messages n’arrivent peut-être pas",
    "inboxHealth.stalled.hint":
      "WhatsApp semble connecté, mais des messages sont bloqués sur ce PC et n’arrivent pas dans la boîte. Appuyez sur Reconnecter pour réessayer.",
    "inboxHealth.stalled.reconnect": "Reconnecter",
    "inboxHealth.ack": "OK",
  },
  ar: {
    "inboxHealth.silent.hours": "آخر رسالة من زبون: قبل {{hours}} ساعة",
    "inboxHealth.silent.days": "آخر رسالة من زبون: قبل {{days}} يوم",
    "inboxHealth.stalled.title": "قد لا تصل الرسائل",
    "inboxHealth.stalled.hint":
      "يبدو واتساب متصلاً، لكن رسائل عالقة على هذا الحاسوب ولا تصل إلى الصندوق. اضغط «إعادة الاتصال» للمحاولة من جديد.",
    "inboxHealth.stalled.reconnect": "إعادة الاتصال",
    "inboxHealth.ack": "حسناً",
  },
};

export function getInboxHealthViewRuntimeTranslation(
  locale: Locale,
  key: string,
): string | undefined {
  return translations[locale][key];
}
