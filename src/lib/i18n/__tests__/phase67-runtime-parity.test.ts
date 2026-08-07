import { describe, expect, it } from "vitest";

import type { Locale } from "@/lib/i18n";
import { getRuntimeTranslation } from "@/lib/i18n/runtime-translations";

const locales: readonly Locale[] = ["en", "fr", "ar"];
const representativeRuntimeKeys = [
  "common.timeline",
  "phase5.auth.owner",
  "automations.runtime.steps",
  "commerce.runtime.history",
  "inbox.whatsappAmbiguous",
] as const;

describe("Phase 6 shared runtime translation authority", () => {
  it.each(representativeRuntimeKeys)(
    "resolves %s in English, French and Arabic",
    (key) => {
      for (const locale of locales) {
        const translated = getRuntimeTranslation(locale, key);
        expect(translated, `${locale} must resolve ${key}`).toBeTypeOf("string");
        expect(translated?.trim()).not.toBe("");
        expect(translated).not.toBe(key);
      }
    },
  );

  it("does not invent values for unknown runtime keys", () => {
    for (const locale of locales) {
      expect(getRuntimeTranslation(locale, "phase67.unknown.runtime.key")).toBeUndefined();
    }
  });
});
