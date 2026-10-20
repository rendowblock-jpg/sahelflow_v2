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

  it("builds no Intl.PluralRules for a message without plural forms (the shipped tables have none): the first one in a fresh Worker is a cost with no effect", () => {
    // TypeScript types Intl.PluralRules as read-only; at runtime it is an ordinary writable property.
    const intl = Intl as unknown as { PluralRules: typeof Intl.PluralRules };
    const original = intl.PluralRules;
    let built = 0;
    intl.PluralRules = new Proxy(original, {
      construct(target, args, newTarget) {
        built += 1;
        return Reflect.construct(target, args, newTarget);
      },
    }) as typeof Intl.PluralRules;
    try {
      for (const locale of PUBLIC_LOCALES) {
        const t = createPublicTranslator(locale);
        t("storefront.view.lowStock", { count: 3 });
        t("storefront.view.lowStock", { count: 1 });
      }
    } finally {
      intl.PluralRules = original;
    }
    expect(built).toBe(0);
  });

  it("still picks a plural form when a message has one (one translator builds the rules once)", () => {
    const table = TABLES.en as Record<string, string>;
    table["test.items_one"] = "{{count}} item";
    table["test.items_other"] = "{{count}} items";
    table["test.items"] = "fallback";
    try {
      const t = createPublicTranslator("en");
      expect(t("test.items", { count: 1 })).toBe("1 item");
      expect(t("test.items", { count: 3 })).toBe("3 items");
      expect(t("test.items", { count: 0 })).toBe("0 items");
      expect(t("test.items")).toBe("fallback");
    } finally {
      delete table["test.items_one"];
      delete table["test.items_other"];
      delete table["test.items"];
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
