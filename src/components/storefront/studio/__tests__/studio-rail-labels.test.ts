import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { STUDIO_PANELS } from "@/components/storefront/studio/studio-rail";

/**
 * Found by the page sweep (4 Nov 2026, Internal.49): the Storefront Studio rail showed the raw
 * text "storefront.studio.rail.legal" under the Legal icon, in English. The rail builds each
 * visible label from `storefront.studio.rail.<panel id>` (the `title` uses the panel's labelKey),
 * and the dictionaries had no `rail.legal` entry. A template-literal key is invisible to the
 * static key checks, so this test walks the panel list instead.
 */
const locales = ["en", "fr", "ar"] as const;

function dictionary(locale: (typeof locales)[number]): Record<string, string> {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), `src/lib/i18n/locales/${locale}.json`), "utf8"),
  ) as Record<string, string>;
}

describe("Storefront Studio rail labels", () => {
  for (const locale of locales) {
    it(`${locale}: every panel has a short visible label (no raw key under an icon)`, () => {
      const words = dictionary(locale);
      const missing: string[] = [];
      for (const { id } of STUDIO_PANELS) {
        const key = `storefront.studio.rail.${id}`;
        const value = words[key];
        if (typeof value !== "string" || value.trim() === "" || value === key) missing.push(key);
      }
      expect(missing).toEqual([]);
    });
  }

  it("keeps the labels short enough for the 56 px rail (at most 12 characters)", () => {
    for (const locale of locales) {
      const words = dictionary(locale);
      for (const { id } of STUDIO_PANELS) {
        const value = words[`storefront.studio.rail.${id}`] ?? "";
        expect([locale, id, value.length <= 12]).toEqual([locale, id, true]);
      }
    }
  });
});
