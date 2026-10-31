import { describe, expect, it } from "vitest";

import { getRuntimeTranslation } from "../runtime-translations";

// claims.mjs: WhatsApp, the couriers, Sheets and the shop connectors are "in testing". The two first-run sentences below used
// to promise what a courier or WhatsApp does for the seller ("shipped order in under a minute", "sends the shipment to your
// courier"). They must describe what the SELLER does and what the APP prepares, in all three languages.
const KEYS = ["onboarding.summary.allDoneBody", "onboarding.loop.beat3.body"] as const;
const LOCALES = ["ar", "fr", "en"] as const;

const BANNED: Record<(typeof LOCALES)[number], RegExp[]> = {
  en: [/under a minute/i, /in a minute/i, /instant/i, /automatic/i, /shipped order/i, /sends? the shipment/i, /to your courier\.?$/i],
  fr: [/moins d'une minute/i, /instantan/i, /automatique/i, /expédiée/i, /envoie l'expédition/i],
  ar: [/أقل من دقيقة/, /فور/, /تلقائي/, /مشحونة/, /ترسل الشحنة/],
};
const SELLER_ACTS: Record<(typeof LOCALES)[number], RegExp> = {
  en: /\byou (confirm|read)\b/i,
  fr: /\bvous (confirmez|lisez)\b/i,
  ar: /تؤكد/,
};
const APP_PREPARES: Record<(typeof LOCALES)[number], RegExp> = {
  en: /the app prepares/i,
  fr: /l'application prépare/i,
  ar: /يجهّز التطبيق/,
};

describe("onboarding copy that touches integrations still in testing", () => {
  for (const locale of LOCALES) {
    for (const key of KEYS) {
      const text = getRuntimeTranslation(locale, key) ?? "";
      it(`${locale} ${key} exists`, () => {
        expect(text.length).toBeGreaterThan(20);
      });
      it(`${locale} ${key} promises nothing a courier or WhatsApp does`, () => {
        for (const banned of BANNED[locale]) expect(text).not.toMatch(banned);
      });
      it(`${locale} ${key} says what the seller does and what the app prepares`, () => {
        expect(text).toMatch(SELLER_ACTS[locale]);
        expect(text).toMatch(APP_PREPARES[locale]);
      });
    }
  }
});
