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

/** The French block of a runtime catalog as key -> value pairs. */
function frPairs(file: string): Array<[string, string]> {
  const source = readFileSync(resolve(root, "src/lib/i18n", file), "utf8");
  const start = source.search(/^\s*fr: \{/m);
  expect(start, `${file} has a fr block`).toBeGreaterThan(-1);
  const rest = source.slice(start);
  const end = rest.slice(1).search(/^ {2}\},/m);
  const block = rest.slice(0, end + 1);
  const pairs: Array<[string, string]> = [];
  for (const m of block.matchAll(/"([\w.-]+)":\s*"((?:[^"\\]|\\.)*)"/gs)) {
    pairs.push([m[1] ?? "", m[2] ?? ""]);
  }
  return pairs;
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
