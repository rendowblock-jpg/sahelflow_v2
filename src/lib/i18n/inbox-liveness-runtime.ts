import type { Locale } from "@/lib/i18n";

/**
 * Runtime dictionary for WhatsApp inbox liveness signals (R4-a): the sidebar
 * unread badge, global new-message toast/sound and the thread-header
 * "Active …" last-seen fallback.
 *
 * The sidecar emits no presence/typing events (verified — SidecarEvent is
 * "status" | "qr" | "message" | "message-update" only), so these surfaces
 * lean on persisted inbox truth (`unreadCount`, `lastMessageAt`) instead of
 * live presence. Keys are candidates for promotion into the locale JSON
 * bundle during the central locale pass (locales/*.json are PR #355-owned).
 */
const translations: Record<Locale, Record<string, string>> = {
  en: {
    "inbox.liveness.unreadMessages": "Unread messages: {{count}}",
    "inbox.liveness.newMessageTitle": "New WhatsApp message",
    "inbox.liveness.newMessageBody": "{{name}}: {{preview}}",
    "inbox.liveness.openInbox": "Open inbox",
    "inbox.liveness.toastToggle": "New message notifications",
    "inbox.liveness.soundToggle": "New message sound",
    "inbox.liveness.lastActive": "Active {{time}}",
    "inbox.liveness.alertsMenu": "Message alert options",
  },
  fr: {
    "inbox.liveness.unreadMessages": "Messages non lus : {{count}}",
    "inbox.liveness.newMessageTitle": "Nouveau message WhatsApp",
    "inbox.liveness.newMessageBody": "{{name}} : {{preview}}",
    "inbox.liveness.openInbox": "Ouvrir la boîte de réception",
    "inbox.liveness.toastToggle": "Notifications de nouveaux messages",
    "inbox.liveness.soundToggle": "Son des nouveaux messages",
    "inbox.liveness.lastActive": "Actif {{time}}",
    "inbox.liveness.alertsMenu": "Options d'alerte des messages",
  },
  ar: {
    "inbox.liveness.unreadMessages": "رسائل غير مقروءة: {{count}}",
    "inbox.liveness.newMessageTitle": "رسالة واتساب جديدة",
    "inbox.liveness.newMessageBody": "{{name}}: {{preview}}",
    "inbox.liveness.openInbox": "افتح صندوق الوارد",
    "inbox.liveness.toastToggle": "تنبيهات الرسائل الجديدة",
    "inbox.liveness.soundToggle": "صوت الرسائل الجديدة",
    "inbox.liveness.lastActive": "نشط {{time}}",
    "inbox.liveness.alertsMenu": "خيارات تنبيهات الرسائل",
  },
};

export function getInboxLivenessRuntimeTranslation(
  locale: Locale,
  key: string,
): string | undefined {
  return translations[locale][key];
}
