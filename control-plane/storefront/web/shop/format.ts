import type { PublicLocale } from "../locale";

const TAG: Record<PublicLocale, string> = { ar: "ar-DZ", fr: "fr-DZ", en: "en-GB" };
const SUFFIX: Record<PublicLocale, string> = { ar: " دج", fr: " DA", en: " DA" };
/** The thousands separator each language's CLDR data uses: "." in Arabic (Algeria), a narrow no-break space in French, "," in English. */
const GROUP: Record<PublicLocale, string> = { ar: ".", fr: "\u202f", en: "," };

const FALLBACK: Partial<Record<PublicLocale, Intl.NumberFormat>> = {};

/**
 * Groups the digits of a whole number in threes, by hand. Measured 20 Oct 2026: in Node the first Intl.NumberFormat costs about 9 ms, but on Cloudflare
 * staging (three sweeps of about 196 cache misses) taking it out changed the page's CPU by 0.02 ms, that is, nothing. It stays because its output is
 * proven equal to Intl (format.test.ts); do not expect a Cloudflare CPU gain from it.
 */
function group(amount: number, separator: string): string {
  const digits = String(amount);
  let out = "";
  for (let end = digits.length; end > 0; end -= 3) {
    out = digits.slice(Math.max(0, end - 3), end) + (out === "" ? "" : separator + out);
  }
  return out;
}

/**
 * Same convention as the app's formatDZD: grouped digits and the dinar suffix.
 *
 * A price is a whole, non-negative number of dinars, and that is written by hand. Anything else (a fraction, a negative,
 * -0, NaN, a number past the safe range) still goes through Intl, so the result is never different from before:
 * format.test.ts compares every whole price from 0 to 250000 in all three languages with Intl, byte for byte.
 */
export function formatPrice(amount: number, locale: PublicLocale): string {
  if (Number.isSafeInteger(amount) && (amount > 0 || Object.is(amount, 0))) return group(amount, GROUP[locale]) + SUFFIX[locale];
  const formatter = (FALLBACK[locale] ??= new Intl.NumberFormat(TAG[locale], { maximumFractionDigits: 0 }));
  return formatter.format(amount) + SUFFIX[locale];
}

export function localeTag(locale: PublicLocale): string {
  return TAG[locale];
}

export function currencySuffix(locale: PublicLocale): string {
  return SUFFIX[locale];
}
