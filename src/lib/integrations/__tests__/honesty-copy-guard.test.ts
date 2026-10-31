import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { INTEGRATION_IDS, integrationStatus, type IntegrationId, type IntegrationStatus } from "../certification";

type Locale = "ar" | "fr" | "en";
const LOCALES: Locale[] = ["ar", "fr", "en"];
const NAMESPACES = ["integrations", "delivery", "whatsapp", "onboarding"];
const COURIERS: IntegrationId[] = ["yalidine", "zr", "ecotrack", "maystro"];

// "Certified" and friends: only an integration the registry calls live may be described this way.
const CERTIFIED: Record<Locale, RegExp[]> = {
  en: [/\bcertified\b/i, /verified provider/i, /fully automatic/i],
  fr: [/certifi[éè]e?s?(?!\p{L})/iu, /(?:fournisseur|transporteur) vérifié/iu, /entièrement automatique/iu],
  // Claim forms only (certified / was certified): the bare noun also means approval and sits in button labels.
  ar: [/معتمد/, /تم\s+(?:ال)?اعتماد/, /تلقائي بالكامل/],
};
// "Automatically": a promise about what an integration does by itself.
const AUTOMATIC: Record<Locale, RegExp[]> = {
  en: [/automatic/i, /\bauto-import/i],
  fr: [/automatique/i],
  ar: [/تلقائ/],
};
// Saying that something is NOT certified is the honest direction; "بيانات الاعتماد" is "credentials" and "الاعتماد عليه" is "relying on it".
const NEGATED = [/بيانات\s+(?:ال)?اعتماد/g, /(?:ال)?اعتماد\s+عل[يى]/g, /\bnot certified\b/gi, /\buncertified\b/gi, /\bnon certifi[éè]e?s?(?!\p{L})/giu, /غير معتمد/g];

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
