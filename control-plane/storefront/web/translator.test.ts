import { describe, expect, it } from "vitest";

import { createStorefrontTranslator } from "../../../src/lib/i18n/storefront-locale";
import { PUBLIC_LOCALES, type PublicLocale } from "./locale";
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

  /** Counts the Intl.PluralRules objects built while `run` executes. TypeScript types Intl.PluralRules as read-only; at runtime it is an ordinary writable property. */
  function pluralRulesBuiltWhile(run: () => void): number {
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
      run();
    } finally {
      intl.PluralRules = original;
    }
    return built;
  }

  /** Adds the given plural forms of `test.count` to a language's table for the duration of `run` (the shipped tables have no plural keys). English really has only one and other. */
  function withPluralMessages(locale: PublicLocale, forms: readonly string[], run: () => void): void {
    const table = TABLES[locale] as Record<string, string>;
    const keys = forms.map((form) => [`test.count_${form}`, `${form}:{{count}}`] as const);
    for (const [key, value] of keys) table[key] = value;
    table["test.count"] = "base:{{count}}";
    try {
      run();
    } finally {
      for (const [key] of keys) delete table[key];
      delete table["test.count"];
    }
  }

  it("builds no Intl.PluralRules for a message without plural forms (the shipped tables have none)", () => {
    const built = pluralRulesBuiltWhile(() => {
      for (const locale of PUBLIC_LOCALES) {
        const t = createPublicTranslator(locale);
        t("storefront.view.lowStock", { count: 3 });
        t("storefront.view.lowStock", { count: 1 });
      }
    });
    expect(built).toBe(0);
  });

  it("builds the plural rules once per translator, not once per call", () => {
    withPluralMessages("en", ["one", "other"], () => {
      const built = pluralRulesBuiltWhile(() => {
        const t = createPublicTranslator("en");
        for (const count of [0, 1, 2, 5, 11]) t("test.count", { count });
      });
      expect(built).toBe(1);
    });
  });

  it("picks the English plural form (one, other)", () => {
    withPluralMessages("en", ["one", "other"], () => {
      const t = createPublicTranslator("en");
      expect([0, 1, 2, 5].map((count) => t("test.count", { count }))).toEqual(["other:0", "one:1", "other:2", "other:5"]);
      expect(t("test.count")).toBe("base:{{count}}");
    });
  });

  it("picks all six Arabic plural forms (zero, one, two, few, many, other), written out from the CLDR rule and not from Intl", () => {
    withPluralMessages("ar", ["zero", "one", "two", "few", "many", "other"], () => {
      const t = createPublicTranslator("ar");
      const expected: Array<[number, string]> = [
        [0, "zero"], [1, "one"], [2, "two"], [3, "few"], [10, "few"], [11, "many"], [99, "many"],
        [100, "other"], [101, "other"], [102, "other"], [103, "few"], [110, "few"], [111, "many"], [200, "other"],
      ];
      // The app's renderer wraps substituted values in invisible direction isolates (U+2066 to U+2069); only the chosen form matters here.
      const plain = (text: string): string => text.replace(/[\u2066-\u2069]/g, "");
      for (const [count, form] of expected) expect(plain(t("test.count", { count })), `count ${count}`).toBe(`${form}:${count}`);
    });
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
