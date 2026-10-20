import { renderTranslation } from "@/lib/i18n/render-translation";

import type { PublicLocale } from "./locale";
import messages from "./messages.generated.json";

export type PublicTranslator = (key: string, params?: Record<string, string | number>) => string;

const TABLES = messages as Record<PublicLocale, Record<string, string>>;

const PLURAL_FORMS = ["zero", "one", "two", "few", "many", "other"] as const;

/**
 * The hosted page's translator. It resolves a key from the small generated
 * message table and renders it with the app's own interpolation and Arabic
 * bidi rules (src/lib/i18n/render-translation.ts), so copy has the same shape
 * as in the Studio preview.
 *
 * The language's plural rules are built only when a message actually has plural forms (key_one, key_other, ...).
 * The shipped tables have none, and the first Intl.PluralRules in a fresh Worker is a cost with no effect on the page.
 */
export function createPublicTranslator(locale: PublicLocale): PublicTranslator {
  const table = TABLES[locale];
  let plurals: Intl.PluralRules | null = null;
  return (key, params) => {
    let value = table[key] ?? key;
    if (params && "count" in params && PLURAL_FORMS.some((form) => table[`${key}_${form}`] !== undefined)) {
      plurals ??= new Intl.PluralRules(locale);
      value = table[`${key}_${plurals.select(Number(params.count))}`] ?? value;
    }
    return renderTranslation(value, params, locale);
  };
}
