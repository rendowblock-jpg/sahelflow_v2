import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { getTranslations } from "@/lib/i18n";
import { getRuntimeTranslation } from "@/lib/i18n/runtime-translations";

/**
 * s42 orderpage: the e2e gate (phase6-7-completion) fails the page when a raw dotted key reaches body.innerText.
 * Every orders.detail.* key the page, the summary strip or the stepper names must exist in en, fr AND ar
 * (JSON or runtime copy); a count-plural key needs the six Arabic forms.
 */
const SOURCES = [
  "src/app/(dashboard)/orders/[id]/page.tsx",
  "src/components/orders/order-summary-strip.tsx",
  "src/components/orders/order-stepper.tsx",
  "src/components/orders/delivery-slip.tsx",
];
const LOCALES = ["en", "fr", "ar"] as const;
const FORMS = ["zero", "one", "two", "few", "many", "other"] as const;

const usedKeys = [
  ...new Set(
    SOURCES.flatMap((path) => {
      const text = readFileSync(resolve(process.cwd(), path), "utf8");
      return [...text.matchAll(/"(orders\.detail\.[A-Za-z]+(?:\.[A-Za-z]+)*)"/g)].flatMap((m) => (m[1] ? [m[1]] : []));
    }),
  ),
].sort();

const lookup = (locale: (typeof LOCALES)[number], key: string) =>
  getTranslations(locale)[key] ?? getRuntimeTranslation(locale, key);

describe("order detail page keys", () => {
  it("finds the keys it is supposed to guard", () => {
    expect(usedKeys).toEqual(
      expect.arrayContaining([
        "orders.detail.breadcrumbLabel",
        "orders.detail.customerAddress",
        "orders.detail.discount",
        "orders.detail.subtotal",
        "orders.detail.itemsCount",
        "orders.detail.risk.moreFactors",
        "orders.detail.summary.total",
        "orders.detail.stepper.current",
      ]),
    );
  });

  it.each(LOCALES)("every orders.detail.* key used by the page exists in %s", (locale) => {
    const missing = usedKeys.filter((key) => !lookup(locale, key));
    expect(missing).toEqual([]);
  });

  it.each(["orders.detail.itemsCount", "orders.detail.risk.moreFactors"])(
    "%s has every plural form in Arabic (and in fr, en)",
    (base) => {
      for (const locale of LOCALES) {
        for (const form of FORMS) {
          expect(lookup(locale, `${base}_${form}`), `${locale} ${base}_${form}`).toBeTruthy();
        }
      }
    },
  );

  it("Arabic new strings are Arabic, not a copy of the English", () => {
    for (const key of usedKeys.filter((k) => /summary|stepper|breadcrumb|customerAddress|moreFactors_/.test(k))) {
      const ar = lookup("ar", key);
      if (ar) expect(ar, key).toMatch(/[\u0600-\u06FF]/);
    }
  });
});
