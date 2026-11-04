import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import frJson from "@/lib/i18n/locales/fr.json";
import { getInboxHealthRuntimeTranslation } from "@/lib/i18n/inbox-health-runtime";
import { getInboxSampleRuntimeTranslation } from "@/lib/i18n/inbox-sample-runtime";
import { formatWaitAge } from "@/lib/inbox/wait-age";

/**
 * Wording rules for the French and Arabic texts added or changed after Internal.47
 * (lane "texts", R50). A MODEL reader wrote these rules from the glossary
 * (core/03-RULES.md 03R.8.2) and the French typography the brief asks for; a native
 * read of the meaning is still owed (audit/program/results/texts-for-founder.md).
 * The same checks, over every changed string, run as audit/program/ui/texts-check.mjs.
 */
const root = process.cwd();
const NBSP = "\u00a0";
const FILES = [
  "inbox-health-runtime.ts",
  "inbox-sample-runtime.ts",
  "inbox-list-runtime.ts",
  "runtime-health-runtime.ts",
];

type Lang = "en" | "fr" | "ar";

/** The block of one language of a runtime catalog as key -> value pairs. */
function localePairs(file: string, lang: Lang): Array<[string, string]> {
  const source = readFileSync(resolve(root, "src/lib/i18n", file), "utf8");
  const start = source.search(new RegExp(`^\\s*${lang}: \\{`, "m"));
  expect(start, `${file} has a ${lang} block`).toBeGreaterThan(-1);
  const rest = source.slice(start);
  const end = rest.slice(1).search(/^ {2}\},/m);
  const block = rest.slice(0, end + 1);
  const pairs: Array<[string, string]> = [];
  for (const m of block.matchAll(/"([\w.-]+)":\s*"((?:[^"\\]|\\.)*)"/gs)) {
    pairs.push([m[1] ?? "", JSON.parse(`"${m[2] ?? ""}"`) as string]);
  }
  return pairs;
}

/** The French block of a runtime catalog as key -> value pairs. */
function frPairs(file: string): Array<[string, string]> {
  return localePairs(file, "fr");
}

const NEW_DICTIONARY_KEYS = [
  "auth.reauth.sessionExpired",
  "auth.reauth.signInAgain",
  "auth.reauth.invalid",
  "auth.reauth.slow",
  "customers.errors.hasOrders",
  "customers.errors.phoneExists",
  "onboarding.pin.title",
  "onboarding.pin.hint",
  "onboarding.pin.verify",
  "onboarding.pin.unavailable",
  "orders.errors.insufficientStock",
  "products.errors.skuExists",
  "storefront.studio.rail.legal",
] as const;

function typographyProblems(key: string, value: string): string[] {
  const out: string[] = [];
  const text = value.replace(/\{\{\s*[\w.]+\s*\}\}/g, "X");
  if (/[A-Za-zÀ-ÿ]'[A-Za-zÀ-ÿ]/.test(text)) out.push(`${key}: straight apostrophe`);
  // clipboard text for support (Copy details) stays plain: only the on-screen texts need the no-break space
  if (!key.startsWith("inboxHealth.copy.")) {
    if (/\S [:;?!](?=\s|$|\))/.test(text)) out.push(`${key}: normal space before : ; ? !`);
    if (/[A-Za-zÀ-ÿ0-9)][:;?!](?=\s|$)/.test(text)) out.push(`${key}: no space before : ; ? !`);
  }
  if (/«(?!\u00a0)/.test(text) || /(?<!\u00a0)»/.test(text)) out.push(`${key}: guillemets need no-break spaces inside`);
  return out;
}

describe("French typography of the texts added after Internal.47", () => {
  for (const file of FILES) {
    it(`${file}: apostrophes, no-break spaces before : ; ? ! and inside « »`, () => {
      const pairs = frPairs(file);
      expect(pairs.length).toBeGreaterThan(4);
      const problems = pairs.flatMap(([k, v]) => typographyProblems(k, v));
      expect(problems).toEqual([]);
    });
  }

  it("fr.json: the 13 keys added after Internal.47 follow the same rules", () => {
    const fr = frJson as Record<string, string>;
    const problems = NEW_DICTIONARY_KEYS.flatMap((k) => typographyProblems(k, fr[k] ?? ""));
    expect(problems).toEqual([]);
  });
});

describe("wording fixes found by the texts review", () => {
  it("the 'oldest' strip line says oldest in French too, not just 'since'", () => {
    expect(getInboxHealthRuntimeTranslation("fr", "inboxHealth.strip.oldest")).toMatch(/plus ancien/);
  });

  it("the recovery-check failure says which check failed in French", () => {
    expect(getInboxHealthRuntimeTranslation("fr", "inboxHealth.strip.checkFailed")).toMatch(/récupération/);
  });

  it("the 'Remove sample data' button fits a button in all three languages (24 characters)", () => {
    for (const locale of ["en", "fr", "ar"] as const) {
      const label = getInboxSampleRuntimeTranslation(locale, "inbox.sample.remove") ?? "";
      expect(label.length, `${locale}: ${label}`).toBeLessThanOrEqual(24);
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it("the Arabic sample-count line says الطلبيات (glossary), not الطلبات", () => {
    const line = getInboxSampleRuntimeTranslation("ar", "inbox.sample.count.orders") ?? "";
    expect(line).toContain("الطلبيات");
    expect(line).not.toContain("الطلبات");
  });
});

describe("Arabic number-agreement of the waiting age (1 / 2 / 3-10 / 11+)", () => {
  const cases: Array<[number, string]> = [
    [1, "دقيقة واحدة"],
    [2, "دقيقتين"],
    [5, "5 دقائق"],
    [11, "11 دقيقة"],
    [120, "ساعتين"],
    [60 * 5, "5 ساعات"],
    [60 * 12, "12 ساعة"],
    [60 * 48, "يومين"],
    [60 * 24 * 5, "5 أيام"],
    [60 * 24 * 30, "30 يوماً"],
  ];
  it.each(cases)("%i minutes reads %s", (minutes, expected) => {
    expect(formatWaitAge("ar", minutes)).toBe(expected);
  });
});

/* ------------------------------------------------------------------------------------------------
 * Completeness and consistency across en / fr / ar (the rules the Founder asked for).
 * ---------------------------------------------------------------------------------------------- */

/** Arabic has more plural forms than en/fr: these keys exist in ar only (see wait-age.ts). */
const AR_ONLY_KEY = /^inboxHealth\.age\.\w+_(one|two|few)$/;
/** Latin-only values that are the same word in French: cognates and WhatsApp's own labels, units. */
const SAME_AS_EN_OK = new Set(["Photo", "Audio", "Document", "Sticker", "Contact", "Code", "{{n}} min", "{{n}} h"]);
/** Latin words allowed inside an Arabic sentence: the brand and the name of the code the seller types. */
const LATIN_IN_AR_OK = new Set(["PIN", "SahelFlow"]);

const placeholders = (v: string) => (v.match(/\{\{\s*[\w.]+\s*\}\}|\{[\w.]+\}/g) ?? []).map((p) => p.replace(/\s/g, "")).sort();
const hasLatin = (v: string) => /[A-Za-z]/.test(v.replace(/\{\{\s*[\w.]+\s*\}\}/g, ""));
const TUTOIEMENT = /(?<![\p{L}'’-])(tu|toi|ton|ta|tes|te|t['’])(?![\p{L}-])/iu;

describe.each(FILES)("%s: en / fr / ar agree", (file) => {
  const en = new Map(localePairs(file, "en"));
  const fr = new Map(localePairs(file, "fr"));
  const ar = new Map(localePairs(file, "ar"));

  it("has the same keys in en and fr, and every en key in ar (ar may add plural forms)", () => {
    expect(en.size).toBeGreaterThan(2);
    expect([...fr.keys()].sort()).toEqual([...en.keys()].sort());
    expect([...en.keys()].filter((k) => !ar.has(k))).toEqual([]);
    expect([...ar.keys()].filter((k) => !en.has(k) && !AR_ONLY_KEY.test(k))).toEqual([]);
  });

  it("has no empty value", () => {
    for (const [lang, map] of [["en", en], ["fr", fr], ["ar", ar]] as const) {
      expect([...map].filter(([, v]) => v.trim() === "").map(([k]) => `${lang}:${k}`)).toEqual([]);
    }
  });

  it("keeps every {{placeholder}} in all three languages (Arabic one/two forms say the number in words)", () => {
    const bad: string[] = [];
    for (const [k, v] of en) {
      if (/^inboxHealth\.age\.\w+_one$/.test(k)) continue;
      const want = JSON.stringify(placeholders(v));
      if (JSON.stringify(placeholders(fr.get(k) ?? "")) !== want) bad.push(`fr:${k}`);
      if (JSON.stringify(placeholders(ar.get(k) ?? "")) !== want) bad.push(`ar:${k}`);
    }
    for (const [k, v] of ar) if (/_few$/.test(k) && AR_ONLY_KEY.test(k) && !placeholders(v).includes("{{n}}")) bad.push(`ar:${k} lost {{n}}`);
    expect(bad).toEqual([]);
  });

  it("does not leave a Latin-only English sentence in fr or ar (cognates are on an allow-list)", () => {
    const bad: string[] = [];
    for (const [k, v] of en) {
      if (!hasLatin(v) || SAME_AS_EN_OK.has(v)) continue;
      if (fr.get(k) === v) bad.push(`fr:${k}`);
      if (ar.get(k) === v) bad.push(`ar:${k}`);
    }
    expect(bad).toEqual([]);
  });

  it("writes no Latin letters in Arabic except the brand and PIN", () => {
    const bad: string[] = [];
    for (const [k, v] of ar) {
      const words = v.replace(/\{\{\s*[\w.]+\s*\}\}/g, "").match(/[A-Za-z][A-Za-z0-9_-]*/g) ?? [];
      for (const w of words) if (!LATIN_IN_AR_OK.has(w)) bad.push(`${k}: ${w}`);
    }
    expect(bad).toEqual([]);
  });

  it("writes no Arabic letters in French or English", () => {
    const bad = [...fr, ...en].filter(([, v]) => /[\u0600-\u06FF]/.test(v)).map(([k]) => k);
    expect(bad).toEqual([]);
  });

  it("addresses the seller with vous in French, never tu", () => {
    expect([...fr].filter(([, v]) => TUTOIEMENT.test(v)).map(([k]) => k)).toEqual([]);
  });

  it("uses the glossary word for an order in Arabic (الطلبية, not الطلب / الطلبات)", () => {
    expect([...ar].filter(([, v]) => /طلبات|الطلب(?![\u0600-\u06FF])/.test(v)).map(([k]) => k)).toEqual([]);
  });
});

describe("the 13 dictionary keys added after Internal.47 exist and agree in en / fr / ar", () => {
  const dict = (lang: Lang) => JSON.parse(readFileSync(resolve(root, `src/lib/i18n/locales/${lang}.json`), "utf8")) as Record<string, string>;
  const en = dict("en");
  const fr = dict("fr");
  const ar = dict("ar");

  it("has every key, non-empty, in all three dictionaries", () => {
    const missing = NEW_DICTIONARY_KEYS.flatMap((k) =>
      ([["en", en], ["fr", fr], ["ar", ar]] as const).filter(([, d]) => !(d[k] ?? "").trim()).map(([l]) => `${l}:${k}`),
    );
    expect(missing).toEqual([]);
  });

  it("keeps placeholders, never tutoie, and translates every sentence", () => {
    const bad: string[] = [];
    for (const k of NEW_DICTIONARY_KEYS) {
      const want = JSON.stringify(placeholders(en[k] ?? ""));
      if (JSON.stringify(placeholders(fr[k] ?? "")) !== want) bad.push(`fr placeholders:${k}`);
      if (JSON.stringify(placeholders(ar[k] ?? "")) !== want) bad.push(`ar placeholders:${k}`);
      if (TUTOIEMENT.test(fr[k] ?? "")) bad.push(`fr tu:${k}`);
      if (hasLatin(en[k] ?? "") && !SAME_AS_EN_OK.has(en[k] ?? "")) {
        if (fr[k] === en[k]) bad.push(`fr = en:${k}`);
        if (ar[k] === en[k]) bad.push(`ar = en:${k}`);
      }
      const words = (ar[k] ?? "").replace(/\{\{\s*[\w.]+\s*\}\}/g, "").match(/[A-Za-z][A-Za-z0-9_-]*/g) ?? [];
      for (const w of words) if (!LATIN_IN_AR_OK.has(w)) bad.push(`ar latin ${w}:${k}`);
      if (/طلبات|الطلب(?![\u0600-\u06FF])/.test(ar[k] ?? "")) bad.push(`ar order word:${k}`);
    }
    expect(bad).toEqual([]);
  });

  it("says PIN the same way in fr: « code PIN »", () => {
    expect(fr["auth.reauth.invalid"]).toContain("code PIN");
    expect(fr["onboarding.pin.title"]).toContain("code PIN");
  });
});
