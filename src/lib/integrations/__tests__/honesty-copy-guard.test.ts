import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { INTEGRATION_IDS, integrationStatus, type IntegrationId, type IntegrationStatus } from "../certification";

type Locale = "ar" | "fr" | "en";
const LOCALES: Locale[] = ["ar", "fr", "en"];
const NAMESPACES = ["integrations", "delivery", "whatsapp", "onboarding"];
const COURIERS: IntegrationId[] = ["yalidine", "zr", "ecotrack", "maystro"];

// "Certified" and friends: only an integration the registry calls live may be described this way.
// A credentials test is not a certification, so the verb and the noun are banned too (certify, certifier, certification).
const CERTIFIED: Record<Locale, RegExp[]> = {
  en: [/\bcertif(?:y|ies|ied|ying|ication)\b/i, /verified provider/i, /fully automatic/i],
  fr: [/certifi(?:er|é|è|e(?!\p{L})|cation)/iu, /(?:fournisseur|transporteur) vérifié/iu, /entièrement automatique/iu],
  // The noun (اعتماد: approval / certification) and the claim forms. The two harmless uses are stripped by NEGATED first.
  ar: [/معتمد/, /اعتماد/, /تلقائي بالكامل/],
};
// "Automatically": a promise about what an integration does by itself.
const AUTOMATIC: Record<Locale, RegExp[]> = {
  en: [/automatic/i, /\bauto-import/i],
  fr: [/automatique/i],
  ar: [/تلقائ/],
};
// Saying that something is NOT certified is the honest direction; "بيانات الاعتماد" is "credentials" and "الاعتماد عليه" is "relying on it".
const NEGATED = [/بيانات\s+(?:ال)?اعتماد/g, /(?:ال)?اعتماد[\u064B-\u065F]*ا?\s+عل[يى]/g, /\bnot certified\b/gi, /\buncertified\b/gi, /\bnon certifi[éè]e?s?(?!\p{L})/giu, /غير معتمد/g];

const NAMES: Array<[IntegrationId, RegExp]> = [
  ["whatsapp", /whatsapp|واتساب/i],
  ["yalidine", /yalidine|ياليدين/i],
  ["zr", /zr[\s_-]?express|zrexpress|\bzr\b/i],
  ["ecotrack", /ecotrack/i],
  ["maystro", /maystro/i],
  ["sheets", /google[\s_-]?sheets?|\bsheets\b/i],
  ["shopify", /shopify/i],
  ["youcan", /youcan/i],
  ["woocommerce", /woo[\s_-]?commerce/i],
  ["meta", /\bmeta\b|pixel/i],
  ["gemini", /gemini/i],
];

/** key -> why the word is fine there. Each entry is checked by a test below. */
const ALLOWED_KEYS: Record<string, string> = {
  "delivery.certified": "the delivery panel shows it only when the registry says that courier is live",
};

function scopeOf(key: string, text: string): IntegrationId[] {
  const named = NAMES.filter(([, pattern]) => pattern.test(key) || pattern.test(text)).map(([id]) => id);
  if (named.length > 0) return named;
  const namespace = key.split(".")[0];
  if (namespace === "delivery") return COURIERS;
  if (namespace === "whatsapp") return ["whatsapp"];
  if (namespace === "integrations") return [...INTEGRATION_IDS];
  return [];
}

function findViolations(
  messages: Record<string, string>,
  locale: Locale,
  statusOf: (id: IntegrationId) => IntegrationStatus = integrationStatus,
): string[] {
  const found: string[] = [];
  for (const [key, value] of Object.entries(messages)) {
    if (!NAMESPACES.includes(key.split(".")[0] ?? "")) continue;
    if (typeof value !== "string" || key in ALLOWED_KEYS) continue;
    const scope = scopeOf(key, value);
    if (scope.length > 0 && scope.every((id) => statusOf(id) === "live")) continue;
    const text = NEGATED.reduce((rest, pattern) => rest.replace(pattern, " "), value);
    if (CERTIFIED[locale].some((pattern) => pattern.test(text))) found.push(`${locale} ${key}: certifies "${value}"`);
    else if (scope.length > 0 && AUTOMATIC[locale].some((pattern) => pattern.test(text))) found.push(`${locale} ${key}: promises automatic "${value}"`);
  }
  return found;
}

// Two studio keys that used to overclaim. They sit outside the integrations namespaces, so they have their own list.
const STUDIO_NO_OVERCLAIM: Record<string, Record<Locale, RegExp[]>> = {
  "storefront.studio.domainAuthority": {
    en: [/forg/i, /cannot be/i, /projected from/i],
    fr: [/falsifi/iu, /ne peut pas/iu],
    ar: [/تزوير/, /لا يمكن/],
  },
  // "Visible to buyers" on a switch says a store is open before anything is published.
  "storefront.studio.visibleToBuyers": {
    en: [/^visible to buyers$/i],
    fr: [/^visible par les acheteurs$/iu],
    ar: [/^ظاهر للمشترين$/],
  },
};

function studioOverclaims(messages: Record<string, string>, locale: Locale, list = STUDIO_NO_OVERCLAIM): string[] {
  const found: string[] = [];
  for (const [key, patterns] of Object.entries(list)) {
    const value = messages[key];
    if (typeof value !== "string") {
      found.push(`${locale} ${key}: missing`);
      continue;
    }
    if (patterns[locale].some((pattern) => pattern.test(value))) found.push(`${locale} ${key}: overclaims "${value}"`);
  }
  return found;
}

// The words the Founder fixed on 31 Oct 2026 (ar and fr of domainAuthority are the builder's, for a native read).
const DECIDED: Record<string, Record<Locale, string>> = {
  "integrations.testConnection": { en: "Test connection", fr: "Tester la connexion", ar: "اختبار الاتصال" },
  "integrations.testFailed": { en: "Connection test failed", fr: "Échec du test de connexion", ar: "فشل اختبار الاتصال" },
  "storefront.studio.visibleToBuyers": { en: "Open to buyers once published", fr: "Ouvert aux acheteurs une fois publié", ar: "مفتوح للمشترين بعد النشر" },
  "storefront.studio.domainAuthority": {
    en: "The custom-domain state is shown as reported by the hosted store; this editor does not change it.",
    fr: "L’état du domaine personnalisé est affiché tel que le signale la boutique hébergée ; cet éditeur ne le modifie pas.",
    ar: "تُعرض حالة النطاق المخصص كما يُبلغ عنها المتجر المستضاف، وهذا المحرر لا يغيّرها.",
  },
};

function decidedText(key: string, locale: Locale): string {
  const words = DECIDED[key];
  if (!words) throw new Error(`no decided wording for ${key}`);
  return words[locale];
}

const load = (locale: Locale) =>
  JSON.parse(readFileSync(join(process.cwd(), `src/lib/i18n/locales/${locale}.json`), "utf8")) as Record<string, string>;

describe("copy about integrations never says certified or automatic while the registry says testing", () => {
  for (const locale of LOCALES) {
    it(`${locale}: integrations.*, delivery.*, whatsapp.* and onboarding.* are honest`, () => {
      const hits = findViolations(load(locale), locale);
      if (hits.length > 0) throw new Error(`GUARD HITS: ${hits.join(" | ")}`);
    });
  }

  it("catches the old wording (the guard itself works)", () => {
    expect(findViolations({ "integrations.testSuccess": "Provider certified" }, "en")).toHaveLength(1);
    expect(findViolations({ "integrations.testSuccess": "Transporteur certifié" }, "fr")).toHaveLength(1);
    expect(findViolations({ "integrations.testSuccess": "تم اعتماد الناقل" }, "ar")).toHaveLength(1);
    expect(findViolations({ "integrations.youcanDesc": "Sync orders from your YouCan store automatically" }, "en")).toHaveLength(1);
    expect(findViolations({ "whatsapp.x": "WhatsApp is a verified provider" }, "en")).toHaveLength(1);
    expect(findViolations({ "integrations.x": "A fully automatic link" }, "en")).toHaveLength(1);
  });

  it("catches the old credentials-test labels: a test is not a certification", () => {
    expect(findViolations({ "integrations.testConnection": "Test & certify" }, "en")).toHaveLength(1);
    expect(findViolations({ "integrations.testFailed": "Certification failed" }, "en")).toHaveLength(1);
    expect(findViolations({ "integrations.testConnection": "Tester et certifier" }, "fr")).toHaveLength(1);
    expect(findViolations({ "integrations.testFailed": "Échec de certification" }, "fr")).toHaveLength(1);
    expect(findViolations({ "integrations.testConnection": "اختبار واعتماد" }, "ar")).toHaveLength(1);
    expect(findViolations({ "integrations.testFailed": "فشل الاعتماد" }, "ar")).toHaveLength(1);
    expect(findViolations({ "delivery.note": "Yalidine is certified" }, "en")).toHaveLength(1);
  });

  it("lets the new credentials-test labels through", () => {
    for (const key of ["integrations.testConnection", "integrations.testFailed"]) {
      for (const locale of LOCALES) expect(findViolations({ [key]: decidedText(key, locale) }, locale)).toEqual([]);
    }
  });

  for (const locale of LOCALES) {
    it(`${locale}: the credentials-test and studio keys carry the decided words`, () => {
      const messages = load(locale);
      for (const [key, words] of Object.entries(DECIDED)) expect(messages[key], key).toBe(words[locale]);
    });
    it(`${locale}: the two studio keys do not overclaim`, () => {
      const hits = studioOverclaims(load(locale), locale);
      if (hits.length > 0) throw new Error(`STUDIO HITS: ${hits.join(" | ")}`);
    });
  }

  it("the studio list catches the old strings and passes the decided ones", () => {
    const OLD: Record<Locale, Record<string, string>> = {
      en: { "storefront.studio.domainAuthority": "Custom-domain state is projected from the hosted control plane and cannot be forged by this editor.", "storefront.studio.visibleToBuyers": "Visible to buyers" },
      fr: { "storefront.studio.domainAuthority": "L’état du domaine personnalisé provient du plan de contrôle hébergé et ne peut pas être falsifié par cet éditeur.", "storefront.studio.visibleToBuyers": "Visible par les acheteurs" },
      ar: { "storefront.studio.domainAuthority": "تأتي حالة النطاق المخصص من منصة التحكم المستضافة ولا يمكن لهذا المحرر تزويرها.", "storefront.studio.visibleToBuyers": "ظاهر للمشترين" },
    };
    for (const locale of LOCALES) {
      expect(studioOverclaims(OLD[locale], locale), locale).toHaveLength(2);
      const decided: Record<string, string> = {};
      for (const key of Object.keys(STUDIO_NO_OVERCLAIM)) decided[key] = decidedText(key, locale);
      expect(studioOverclaims(decided, locale), locale).toEqual([]);
    }
    expect(Object.keys(STUDIO_NO_OVERCLAIM).sort()).toEqual(["storefront.studio.domainAuthority", "storefront.studio.visibleToBuyers"]);
  });

  it("lets honest wording through: negations, credentials, and a live integration", () => {
    expect(findViolations({ "delivery.uncertified": "Not certified" }, "en")).toEqual([]);
    expect(findViolations({ "x.y": "Non certifié" }, "fr")).toEqual([]);
    expect(findViolations({ "delivery.a": "غير معتمد" }, "ar")).toEqual([]);
    expect(findViolations({ "integrations.a": "بيانات الاعتماد مقبولة" }, "ar")).toEqual([]);
    expect(findViolations({ "integrations.a": "تحقّق معها قبل الاعتماد عليه" }, "ar")).toEqual([]);
    expect(findViolations({ "integrations.a": "Credentials accepted by the provider" }, "en")).toEqual([]);
    expect(findViolations({ "integrations.a": "Yalidine certified" }, "en", () => "live")).toEqual([]);
  });

  it("only exempts delivery.certified, and the panel gates it on the registry", () => {
    expect(Object.keys(ALLOWED_KEYS)).toEqual(["delivery.certified"]);
    const panel = readFileSync(join(process.cwd(), "src/components/settings/delivery-credentials-panel.tsx"), "utf8");
    expect(panel).toContain("registryStatus: integrationStatus(");
  });
});
