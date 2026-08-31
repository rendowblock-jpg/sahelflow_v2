"use client";

/**
 * Buyer-facing language switcher (R4-c).
 *
 * Compact segmented control ("FR | عربية | EN") rendered in the storefront
 * utility strip. Switching is a pure client transaction: set the
 * storefront-only cookie, commit the live locale, reconcile the RSC tree —
 * no page reload, no dashboard locale touched.
 *
 * All three locales ship because the static storefront bundle covers
 * ar/fr/en with 100% parity (236 keys each — verified by the storefront
 * locale contract test).
 */

import { cn } from "@/lib/utils";
import type { Locale } from "@/lib/i18n";

import { useStorefrontI18n } from "./storefront-locale-provider";

const SWITCHER_ENTRIES: ReadonlyArray<{
  locale: Locale;
  label: string;
}> = [
  { locale: "fr", label: "FR" },
  { locale: "ar", label: "عربية" },
  { locale: "en", label: "EN" },
];

export function StorefrontLanguageSwitcher() {
  const { t, locale, setLocale, isLocalePending } = useStorefrontI18n();

  return (
    <div
      role="group"
      aria-label={t("storefront.language.label")}
      data-storefront-language-switcher="true"
      data-storefront-active-locale={locale}
      className="inline-flex items-center gap-0.5 rounded-full border border-border bg-background/90 p-0.5 text-xs font-medium shadow-sm"
    >
      {SWITCHER_ENTRIES.map((entry) => {
        const active = entry.locale === locale;
        return (
          <button
            key={entry.locale}
            type="button"
            onClick={() => setLocale(entry.locale)}
            aria-pressed={active}
            lang={entry.locale}
            dir={entry.locale === "ar" ? "rtl" : "ltr"}
            disabled={isLocalePending && !active}
            data-storefront-locale-option={entry.locale}
            className={cn(
              "min-w-11 rounded-full px-3 py-1.5 transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {entry.label}
          </button>
        );
      })}
    </div>
  );
}
