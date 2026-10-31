import type { Locale } from "@/lib/i18n";

/**
 * The calm notice when the free AI limit is used up, and the one-line hint
 * before it. Same keys in ar, fr and en. Never a status code, never a
 * provider's name. {{time}} is the local reset time, {{left}} a request count.
 */
const translations: Record<Locale, Record<string, string>> = {
  ar: {
    "aiQuota.paused":
      "استُنفدت حصة الذكاء الاصطناعي المجانية حتى الساعة {{time}}. تعمل الطلبات والرسائل كالمعتاد، ولا يزال القارئ دون اتصال يقرأ الطلبات. أضف مفتاحًا ثانيًا أو غيّر المزوّد من الإعدادات.",
    "aiQuota.pausedApprox":
      "استُنفدت حصة الذكاء الاصطناعي المجانية حاليًا. سنحاول مجددًا نحو الساعة {{time}}. تعمل الطلبات والرسائل كالمعتاد، ولا يزال القارئ دون اتصال يقرأ الطلبات. أضف مفتاحًا ثانيًا أو غيّر المزوّد من الإعدادات.",
    "aiQuota.low": "عدد طلبات الذكاء الاصطناعي المجانية المتبقية اليوم: حوالي {{left}}.",
  },
  fr: {
    "aiQuota.paused":
      "Votre limite gratuite d'IA est atteinte jusqu'à {{time}}. Les commandes et les messages fonctionnent toujours, et le lecteur hors ligne lit encore les commandes. Ajoutez une deuxième clé ou changez de fournisseur dans les Paramètres.",
    "aiQuota.pausedApprox":
      "Votre limite gratuite d'IA est atteinte pour le moment. Nouvel essai vers {{time}}. Les commandes et les messages fonctionnent toujours, et le lecteur hors ligne lit encore les commandes. Ajoutez une deuxième clé ou changez de fournisseur dans les Paramètres.",
    "aiQuota.low": "Demandes d'IA gratuites restantes aujourd'hui : environ {{left}}.",
  },
  en: {
    "aiQuota.paused":
      "Your free AI limit is used up until {{time}}. Orders and messages still work, and the offline reader still reads orders. Add a second key or switch provider in Settings.",
    "aiQuota.pausedApprox":
      "Your free AI limit is used up for now. We will try again around {{time}}. Orders and messages still work, and the offline reader still reads orders. Add a second key or switch provider in Settings.",
    "aiQuota.low": "Free AI requests left today: about {{left}}.",
  },
};

export function getAiQuotaRuntimeTranslation(locale: Locale, key: string): string | undefined {
  return translations[locale]?.[key];
}
