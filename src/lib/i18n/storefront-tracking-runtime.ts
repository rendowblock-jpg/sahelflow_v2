import type { Locale } from "@/lib/i18n";

/**
 * Words for the Studio's Tracking panel (the seller's Meta and TikTok pixel ids). The two panel labels for the rail
 * (`storefront.studio.panels.tracking`, `storefront.studio.rail.tracking`) live in the locale files like the other rail entries.
 * The error keys are the ones `trackingFieldError` (studio-tracking.ts) returns; the messages repeat its rules (Meta: 10-20 digits,
 * TikTok: 10-32 capital letters or digits). Arabic is DRAFT until a native reader has read it.
 */
type Row = Readonly<{ en: string; fr: string; ar: string }>;

const ROWS: Record<string, Row> = {
  "storefront.tracking.title": { en: "Ad tracking", fr: "Suivi publicitaire", ar: "تتبع الإعلانات" },
  "storefront.tracking.description": {
    en: "Add your pixel ids to measure your ads. Leave a field empty to turn it off.",
    fr: "Ajoutez vos identifiants de pixel pour mesurer vos publicités. Laissez un champ vide pour le désactiver.",
    ar: "أضف معرّفات البكسل لقياس إعلاناتك. اترك الحقل فارغًا لإيقافه.",
  },
  "storefront.tracking.meta.label": { en: "Meta Pixel ID", fr: "ID du pixel Meta", ar: "معرّف بكسل Meta" },
  "storefront.tracking.meta.hint": {
    en: "Find it in Meta Events Manager. Digits only.",
    fr: "À trouver dans le Gestionnaire d’événements Meta. Chiffres uniquement.",
    ar: "تجده في مدير الأحداث في Meta. أرقام فقط.",
  },
  "storefront.tracking.error.meta": {
    en: "Not saved: enter 10 to 20 digits, with no spaces or other characters.",
    fr: "Non enregistré : saisissez 10 à 20 chiffres, sans espace ni autre caractère.",
    ar: "لم يُحفظ: أدخل من 10 إلى 20 رقمًا دون مسافات أو رموز أخرى.",
  },
  "storefront.tracking.tiktok.label": { en: "TikTok Pixel ID", fr: "ID du pixel TikTok", ar: "معرّف بكسل TikTok" },
  "storefront.tracking.tiktok.hint": {
    en: "Find it in TikTok Events Manager. Capital letters and digits only.",
    fr: "À trouver dans le Gestionnaire d’événements TikTok. Majuscules et chiffres uniquement.",
    ar: "تجده في مدير الأحداث في TikTok. أحرف إنجليزية كبيرة وأرقام فقط.",
  },
  "storefront.tracking.error.tiktok": {
    en: "Not saved: enter 10 to 32 capital letters or digits, with no spaces or other characters.",
    fr: "Non enregistré : saisissez 10 à 32 majuscules ou chiffres, sans espace ni autre caractère.",
    ar: "لم يُحفظ: أدخل من 10 إلى 32 حرفًا إنجليزيًا كبيرًا أو رقمًا دون مسافات أو رموز أخرى.",
  },
};

const LOCALES: readonly Locale[] = ["ar", "fr", "en"];

const translations = Object.fromEntries(
  LOCALES.map((locale) => [locale, Object.fromEntries(Object.entries(ROWS).map(([key, row]) => [key, row[locale]]))]),
) as Record<Locale, Record<string, string>>;

/** key | ar | fr | en, for the Founder's native read. */
export function storefrontTrackingRuntimeEntries(): Array<{ key: string; ar: string; fr: string; en: string }> {
  return Object.entries(ROWS).map(([key, row]) => ({ key, ar: row.ar, fr: row.fr, en: row.en }));
}

export function getStorefrontTrackingRuntimeTranslation(locale: Locale, key: string): string | undefined {
  return translations[locale][key];
}
