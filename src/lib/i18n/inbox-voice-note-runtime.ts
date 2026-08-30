import type { Locale } from "@/lib/i18n";

/**
 * Runtime dictionary for the WhatsApp-grade voice-note player (R5-e, d5
 * experience finding #9: "voice notes render bare <audio controls> — no
 * waveform/duration/speed").
 *
 * Keys are candidates for promotion into the locale JSON bundle during the
 * central locale pass (locales/*.json are PR #355-owned). Verified empty in the
 * bundle today — see src/components/inbox/__tests__/voice-note-player.test.ts,
 * which asserts no `inbox.voice.*` key collides with the static dictionaries.
 */
const translations = {
  en: {
    "inbox.voice.player": "Voice note player",
    "inbox.voice.play": "Play voice note",
    "inbox.voice.pause": "Pause voice note",
    "inbox.voice.speed": "Playback speed",
    "inbox.voice.seek": "Voice note position",
    "inbox.voice.time": "Elapsed time and total duration",
    "inbox.voice.loadFailed": "This voice note could not be loaded.",
    "inbox.voice.retry": "Retry",
  },
  fr: {
    "inbox.voice.player": "Lecteur de message vocal",
    "inbox.voice.play": "Lire le message vocal",
    "inbox.voice.pause": "Mettre le message vocal en pause",
    "inbox.voice.speed": "Vitesse de lecture",
    "inbox.voice.seek": "Position dans le message vocal",
    "inbox.voice.time": "Temps écoulé et durée totale",
    "inbox.voice.loadFailed": "Impossible de charger ce message vocal.",
    "inbox.voice.retry": "Réessayer",
  },
  ar: {
    "inbox.voice.player": "مشغّل الرسائل الصوتية",
    "inbox.voice.play": "تشغيل الرسالة الصوتية",
    "inbox.voice.pause": "إيقاف الرسالة الصوتية مؤقتًا",
    "inbox.voice.speed": "سرعة التشغيل",
    "inbox.voice.seek": "موضع تشغيل الرسالة الصوتية",
    "inbox.voice.time": "الوقت المنقضي والمدة الكلية",
    "inbox.voice.loadFailed": "تعذّر تحميل هذه الرسالة الصوتية.",
    "inbox.voice.retry": "إعادة المحاولة",
  },
} as const satisfies Record<Locale, Record<string, string>>;

export type InboxVoiceNoteCopyKey = keyof (typeof translations)["en"];

/**
 * Typed overload for player call sites (dotted key, guaranteed string); the
 * `key: string` overload is what the shared runtime chain resolves through,
 * matching the sibling runtime dictionaries' contract.
 */
export function getInboxVoiceNoteRuntimeTranslation(
  locale: Locale,
  key: InboxVoiceNoteCopyKey,
): string;
export function getInboxVoiceNoteRuntimeTranslation(
  locale: Locale,
  key: string,
): string | undefined;
export function getInboxVoiceNoteRuntimeTranslation(
  locale: Locale,
  key: string,
): string | undefined {
  const dict = translations[locale] as Readonly<Record<string, string>>;
  return dict[key] ?? translations.en[key as InboxVoiceNoteCopyKey];
}
