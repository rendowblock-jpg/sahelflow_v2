import en from "@/lib/i18n/locales/en.json";
import { getRuntimeTranslation } from "@/lib/i18n/runtime-translations";

/** English translator the way the app builds it: JSON first, runtime catalogs next, plural suffix, {{x}} filled. */
export function makeEnglishT() {
  const table = en as Record<string, string>;
  return (key: string, params?: Record<string, string | number>): string => {
    const lookup = (k: string) => table[k] ?? getRuntimeTranslation("en", k);
    let value = lookup(key) ?? key;
    if (params && typeof params.count === "number") {
      value = lookup(`${key}_${new Intl.PluralRules("en").select(params.count)}`) ?? value;
    }
    return value.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => String(params?.[name] ?? ""));
  };
}
