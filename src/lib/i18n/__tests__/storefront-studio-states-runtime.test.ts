import { describe, expect, it } from "vitest";

import { getRuntimeTranslation } from "@/lib/i18n/runtime-translations";
import {
  STOREFRONT_STUDIO_STATES_KEYS,
  getStorefrontStudioStatesRuntimeTranslation,
} from "@/lib/i18n/storefront-studio-states-runtime";

const LOCALES = ["ar", "fr", "en"] as const;
const placeholders = (text: string) => [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();

describe("storefront studio states copy", () => {
  it("has a non-empty ar, fr and en string for every key", () => {
    expect(STOREFRONT_STUDIO_STATES_KEYS.length).toBeGreaterThan(10);
    for (const key of STOREFRONT_STUDIO_STATES_KEYS) {
      for (const locale of LOCALES) {
        const text = getStorefrontStudioStatesRuntimeTranslation(locale, key);
        expect(text?.trim(), `${locale} ${key}`).toBeTruthy();
      }
    }
  });

  it("keeps the same {{placeholders}} in all three languages", () => {
    for (const key of STOREFRONT_STUDIO_STATES_KEYS) {
      const en = placeholders(getStorefrontStudioStatesRuntimeTranslation("en", key) ?? "");
      for (const locale of ["ar", "fr"] as const) {
        const other = placeholders(getStorefrontStudioStatesRuntimeTranslation(locale, key) ?? "");
        expect(other, `${locale} ${key}`).toEqual(en);
      }
    }
  });

  it("is reachable through the shared runtime resolver", () => {
    const key = STOREFRONT_STUDIO_STATES_KEYS[0] ?? "";
    expect(getRuntimeTranslation("fr", key)).toBe(getStorefrontStudioStatesRuntimeTranslation("fr", key));
  });

  it("ties the copy to what is true today: no hosted-photo or live-store promise", () => {
    for (const locale of LOCALES) {
      for (const key of STOREFRONT_STUDIO_STATES_KEYS) {
        const text = getStorefrontStudioStatesRuntimeTranslation(locale, key) ?? "";
        expect(text, `${locale} ${key}`).not.toMatch(/\bis live now\b|est en ligne maintenant|حي الآن/i);
      }
    }
  });
});
