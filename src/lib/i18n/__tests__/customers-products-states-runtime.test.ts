import { describe, expect, it } from "vitest";

import { getRuntimeTranslation } from "@/lib/i18n/runtime-translations";

const KEYS = ["storefront.list.clearFilters"];

describe("customers / products / storefront list copy", () => {
  it("every key is registered and non-empty in ar, fr and en", () => {
    for (const locale of ["ar", "fr", "en"] as const) {
      for (const key of KEYS) {
        const text = getRuntimeTranslation(locale, key);
        expect(text, `${locale} ${key}`).toBeTruthy();
      }
    }
  });
  it("the Arabic copy is Arabic and the others are not", () => {
    expect(getRuntimeTranslation("ar", KEYS[0] as string)).toMatch(/[\u0600-\u06FF]/);
    expect(getRuntimeTranslation("fr", KEYS[0] as string)).not.toMatch(/[\u0600-\u06FF]/);
    expect(getRuntimeTranslation("en", KEYS[0] as string)).not.toMatch(/[\u0600-\u06FF]/);
  });
});
