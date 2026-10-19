import { renderTranslation } from "@/lib/i18n/render-translation";

import type { PublicLocale } from "./locale";
import messages from "./messages.generated.json";

export type PublicTranslator = (key: string, params?: Record<string, string | number>) => string;

const TABLES = messages as Record<PublicLocale, Record<string, string>>;

/**
 * The hosted page's translator. It resolves a key from the small generated
 * message table and renders it with the app's own interpolation and Arabic
 * bidi rules (src/lib/i18n/render-translation.ts), so copy has the same shape
 * as in the Studio preview.
 */
export function createPublicTranslator(locale: PublicLocale): PublicTranslator {
  const table = TABLES[locale];
  const plurals = new Intl.PluralRules(locale);
  return (key, params) => {
    let value = table[key] ?? key;
    if (params && "count" in params) {
      value = table[`${key}_${plurals.select(Number(params.count))}`] ?? value;
    }
    return renderTranslation(value, params, locale);
  };
}
