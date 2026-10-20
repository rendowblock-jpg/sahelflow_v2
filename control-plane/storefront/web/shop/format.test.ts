import { describe, expect, it, vi } from "vitest";

import { PUBLIC_LOCALES, type PublicLocale } from "../locale";
import { currencySuffix, formatPrice, localeTag } from "./format";

/** The formatter the page used before: the reference every price must still match, byte for byte. */
function viaIntl(amount: number, locale: PublicLocale): string {
  return new Intl.NumberFormat(localeTag(locale), { maximumFractionDigits: 0 }).format(amount) + currencySuffix(locale);
}

/** Counts the Intl.NumberFormat objects built while `run` executes (a cold one costs 10-25 ms of Worker CPU on first use). */
function constructedWhile(run: () => void): number {
  const original = Intl.NumberFormat;
  let count = 0;
  Intl.NumberFormat = new Proxy(original, {
    construct(target, args, newTarget) {
      count += 1;
      return Reflect.construct(target, args, newTarget);
    },
  }) as typeof Intl.NumberFormat;
  try {
    run();
  } finally {
    Intl.NumberFormat = original;
  }
  return count;
}

describe("formatPrice", () => {
  it("states the three conventions it must keep: '.' in Arabic, a narrow no-break space in French, ',' in English", () => {
    expect(formatPrice(5_100, "ar")).toBe("5.100 دج");
    expect(formatPrice(5_100, "fr")).toBe("5\u202f100 DA");
    expect(formatPrice(5_100, "en")).toBe("5,100 DA");
    expect(formatPrice(0, "ar")).toBe("0 دج");
    expect(formatPrice(999, "fr")).toBe("999 DA");
    expect(formatPrice(1_234_567, "en")).toBe("1,234,567 DA");
  });

  it.each(PUBLIC_LOCALES)("matches Intl exactly for every whole price from 0 to 250000 (%s)", (locale) => {
    const intl = new Intl.NumberFormat(localeTag(locale), { maximumFractionDigits: 0 });
    const suffix = currencySuffix(locale);
    for (let amount = 0; amount <= 250_000; amount += 1) {
      const expected = intl.format(amount) + suffix;
      if (formatPrice(amount, locale) !== expected) throw new Error(`${locale} ${amount}: got "${formatPrice(amount, locale)}", Intl says "${expected}"`);
    }
  });

  it.each(PUBLIC_LOCALES)("matches Intl for very large whole prices (%s)", (locale) => {
    for (const amount of [999_999, 1_000_000, 12_345_678, 999_999_999, 1_000_000_000, 10 ** 12, 123_456_789_012, Number.MAX_SAFE_INTEGER]) {
      expect(formatPrice(amount, locale), `${locale} ${amount}`).toBe(viaIntl(amount, locale));
    }
  });

  it.each(PUBLIC_LOCALES)("still answers what Intl answers for values a price never is: negative, fractional, huge, -0, NaN, Infinity (%s)", (locale) => {
    for (const amount of [-1, -5_100, -0, 2_500.4, 2_500.6, 0.5, 1e21, Number.MAX_SAFE_INTEGER + 2, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(formatPrice(amount, locale), `${locale} ${String(amount)}`).toBe(viaIntl(amount, locale));
    }
  });

  it("builds no Intl.NumberFormat for a whole price: the first one in a fresh Worker costs more than the whole page", async () => {
    // A freshly loaded copy of the module: the fallback formatters other tests built (and it caches) must not hide a price that takes the Intl path.
    vi.resetModules();
    const fresh = await import("./format");
    const built = constructedWhile(() => {
      for (const locale of PUBLIC_LOCALES) for (const amount of [0, 7, 900, 2_500, 12_500, 1_234_567]) fresh.formatPrice(amount, locale);
    });
    expect(built).toBe(0);
  });

  it("builds a fallback formatter once per language, not once per call", async () => {
    vi.resetModules();
    const fresh = await import("./format");
    const built = constructedWhile(() => {
      for (let call = 0; call < 5; call += 1) fresh.formatPrice(-5_100, "ar");
      fresh.formatPrice(2_500.6, "fr");
    });
    expect(built).toBe(2);
  });
});
