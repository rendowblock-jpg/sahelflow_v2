import { describe, expect, it } from "vitest";

import { createStorefrontTranslator } from "../../../src/lib/i18n/storefront-locale";
import { PUBLIC_LOCALES } from "./locale";
import messages from "./messages.generated.json";
import { createPublicTranslator } from "./translator";

const TABLES = messages as Record<string, Record<string, string>>;

describe("hosted page translator", () => {
  it("ships the same messages in all three languages (plural forms differ by language)", () => {
    const base = (locale: string) =>
      [...new Set(Object.keys(TABLES[locale] ?? {}).map((key) => key.replace(/_(zero|one|two|few|many|other)$/, "")))].sort();
    const reference = base("ar");
    expect(reference.length).toBeGreaterThan(30);
    expect(base("fr")).toEqual(reference);
    expect(base("en")).toEqual(reference);
  });

  it.each(PUBLIC_LOCALES)("renders every message exactly as the app does (%s)", (locale) => {
    const hosted = createPublicTranslator(locale);
    const app = createStorefrontTranslator(locale);
    const params = { count: 3, name: "Miroir Mural Décoratif", n: 7 };
    for (const key of Object.keys(TABLES[locale] ?? {})) {
      expect(hosted(key, params), key).toBe(app(key, params));
      expect(hosted(key), key).toBe(app(key));
    }
  });

  it.each(PUBLIC_LOCALES)("picks the plural form the app picks for 0, 1, 2, 5 and 11 (%s)", (locale) => {
    const hosted = createPublicTranslator(locale);
    const app = createStorefrontTranslator(locale);
    for (const count of [0, 1, 2, 5, 11, 100]) {
      expect(hosted("storefront.view.lowStock", { count })).toBe(app("storefront.view.lowStock", { count }));
      expect(hosted("storefront.view.productsCount", { count })).toBe(app("storefront.view.productsCount", { count }));
    }
  });

  it("never shows a raw key for a message the page uses", () => {
    for (const locale of PUBLIC_LOCALES) {
      const t = createPublicTranslator(locale);
      for (const key of ["storefront.public.notFoundTitle", "storefront.public.pausedBody", "storefront.view.outOfStock"]) {
        expect(t(key)).not.toBe(key);
      }
    }
  });
});
