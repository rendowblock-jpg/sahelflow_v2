import type { Locale } from "@/lib/i18n";

/**
 * Runtime copy of the WhatsApp send guard (a send to a chat is paused, warned
 * or held to protect the seller's own WhatsApp number). Plural keys follow the
 * Arabic categories (one/two/few/many) for every language; English and French
 * repeat their "other" form where they do not differ.
 */
const translations: Record<Locale, Record<string, string>> = {
  en: {
    "whatsapp.sendGuard.paused.one": "Sending to this chat is paused for 1 minute to protect your WhatsApp number.",
    "whatsapp.sendGuard.paused.two": "Sending to this chat is paused for {{minutes}} minutes to protect your WhatsApp number.",
    "whatsapp.sendGuard.paused.few": "Sending to this chat is paused for {{minutes}} minutes to protect your WhatsApp number.",
    "whatsapp.sendGuard.paused.many": "Sending to this chat is paused for {{minutes}} minutes to protect your WhatsApp number.",
    "whatsapp.sendGuard.warn": "{{count}} messages sent to this chat in the last hour. Slow down to protect your WhatsApp number.",
    "whatsapp.sendGuard.held": "On hold: the same message is going to many chats. Approve it in the inbox to send it.",
  },
  fr: {
    "whatsapp.sendGuard.paused.one": "L’envoi vers cette discussion est suspendu pendant 1 minute pour protéger votre numéro WhatsApp.",
    "whatsapp.sendGuard.paused.two": "L’envoi vers cette discussion est suspendu pendant {{minutes}} minutes pour protéger votre numéro WhatsApp.",
    "whatsapp.sendGuard.paused.few": "L’envoi vers cette discussion est suspendu pendant {{minutes}} minutes pour protéger votre numéro WhatsApp.",
    "whatsapp.sendGuard.paused.many": "L’envoi vers cette discussion est suspendu pendant {{minutes}} minutes pour protéger votre numéro WhatsApp.",
    "whatsapp.sendGuard.warn": "{{count}} messages envoyés à cette discussion depuis une heure. Ralentissez pour protéger votre numéro WhatsApp.",
    "whatsapp.sendGuard.held": "En attente : le même message part vers de nombreuses discussions. Approuvez-le dans la boîte de réception pour l’envoyer.",
  },
  ar: {
    "whatsapp.sendGuard.paused.one": "تم إيقاف الإرسال إلى هذه المحادثة لمدة دقيقة واحدة لحماية رقم واتساب الخاص بك.",
    "whatsapp.sendGuard.paused.two": "تم إيقاف الإرسال إلى هذه المحادثة لمدة دقيقتين لحماية رقم واتساب الخاص بك.",
    "whatsapp.sendGuard.paused.few": "تم إيقاف الإرسال إلى هذه المحادثة لمدة {{minutes}} دقائق لحماية رقم واتساب الخاص بك.",
    "whatsapp.sendGuard.paused.many": "تم إيقاف الإرسال إلى هذه المحادثة لمدة {{minutes}} دقيقة لحماية رقم واتساب الخاص بك.",
    "whatsapp.sendGuard.warn": "تم إرسال {{count}} رسالة إلى هذه المحادثة خلال الساعة الأخيرة. خفّف الإرسال لحماية رقم واتساب الخاص بك.",
    "whatsapp.sendGuard.held": "قيد الانتظار: الرسالة نفسها ستصل إلى محادثات كثيرة. وافق عليها من صندوق الوارد لإرسالها.",
  },
};

export function getWhatsAppSendGuardRuntimeTranslation(
  locale: Locale,
  key: string,
): string | undefined {
  return translations[locale][key];
}

type CopyT = (key: string, params?: Record<string, string | number>) => string;

/** Whole minutes to show for a pause in seconds: never 0, rounded up. */
export function sendGuardPauseMinutes(retryAfterSeconds: number | undefined): number {
  const seconds = Number.isFinite(retryAfterSeconds) ? (retryAfterSeconds as number) : 3600;
  return Math.max(1, Math.ceil(seconds / 60));
}

export function sendGuardPausedKey(minutes: number): string {
  if (minutes === 1) return "whatsapp.sendGuard.paused.one";
  if (minutes === 2) return "whatsapp.sendGuard.paused.two";
  if (minutes >= 3 && minutes <= 10) return "whatsapp.sendGuard.paused.few";
  return "whatsapp.sendGuard.paused.many";
}

/** "Sending to this chat is paused for N minutes to protect your WhatsApp number." */
export function sendGuardPausedCopy(t: CopyT, retryAfterSeconds: number | undefined): string {
  const minutes = sendGuardPauseMinutes(retryAfterSeconds);
  return t(sendGuardPausedKey(minutes), { minutes });
}

/** Inline notice after a send the guard warned about; null when there is nothing to say. */
export function sendGuardWarnCopy(
  t: CopyT,
  guard: { action?: string; conversationCountLastHour?: number } | null | undefined,
): string | null {
  if (guard?.action !== "warn") return null;
  return t("whatsapp.sendGuard.warn", { count: guard.conversationCountLastHour ?? 0 });
}
