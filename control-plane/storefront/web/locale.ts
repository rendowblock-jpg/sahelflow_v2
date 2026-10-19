/**
 * Buyer language for the hosted store page.
 *
 * Same rules as the app's buyer-locale authority (src/lib/i18n/storefront-locale.ts):
 * an explicit ?lang= wins, then the browser's Accept-Language with Algeria's
 * preference breaking ties (Arabic, then French, then English). The Worker cannot
 * import that file because it also pulls every dashboard dictionary, so the
 * logic is repeated here and locale.test.ts keeps the two identical.
 */
export type PublicLocale = "ar" | "fr" | "en";

export const PUBLIC_LOCALES: readonly PublicLocale[] = ["ar", "fr", "en"] as const;

const PRIORITY: Record<PublicLocale, number> = { ar: 0, fr: 1, en: 2 };

export function parsePublicLocale(value: string | null | undefined): PublicLocale | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return (PUBLIC_LOCALES as readonly string[]).includes(normalized) ? (normalized as PublicLocale) : null;
}

export function parseAcceptLanguage(header: string | null | undefined): PublicLocale | null {
  if (!header) return null;
  const candidates: Array<{ locale: PublicLocale; quality: number; index: number }> = [];
  header
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .forEach((entry, index) => {
      const [tag, ...parameters] = entry.split(";").map((part) => part.trim());
      const primary = /^([A-Za-z]{2,8})(?:$|-|_)/.exec(tag ?? "")?.[1];
      if (!primary) return;
      const locale = parsePublicLocale(primary);
      if (!locale) return;
      let quality = 1;
      for (const parameter of parameters) {
        const match = /^q=([0-9]+(?:\.[0-9]+)?)$/i.exec(parameter);
        if (match?.[1]) {
          const parsed = Number.parseFloat(match[1]);
          if (!Number.isNaN(parsed)) quality = parsed;
        }
      }
      candidates.push({ locale, quality, index });
    });
  const best = candidates.sort(
    (a, b) => b.quality - a.quality || PRIORITY[a.locale] - PRIORITY[b.locale] || a.index - b.index,
  )[0];
  return best ? best.locale : null;
}

export function directionOf(locale: PublicLocale): "ltr" | "rtl" {
  return locale === "ar" ? "rtl" : "ltr";
}
