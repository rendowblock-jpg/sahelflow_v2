import type { Locale } from "@/lib/i18n";

/**
 * Runtime copy for the desktop phone-pairing card while the phone app is still in testing:
 * a visible label and one sentence. The flag PHONE_PAIRING_AVAILABLE stays false.
 */
const translations: Record<Locale, Record<string, string>> = {
  en: {
    "phones.testing.label": "In testing",
    "phones.testing.note": "This link works only once the phone-link server is live.",
  },
  fr: {
    "phones.testing.label": "En test",
    "phones.testing.note": "Ce lien ne fonctionne qu’une fois le serveur de liaison du téléphone en ligne.",
  },
  ar: {
    "phones.testing.label": "قيد التجربة",
    "phones.testing.note": "لا يعمل هذا الرابط إلا بعد تشغيل خادم ربط الهاتف.",
  },
};

export function getPhoneAppTestingRuntimeTranslation(locale: Locale, key: string): string | undefined {
  return translations[locale][key];
}
