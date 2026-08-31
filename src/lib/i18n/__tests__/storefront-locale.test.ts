import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import type { Locale } from "@/lib/i18n";
import { getRuntimeTranslation } from "@/lib/i18n/runtime-translations";
import {
  createStorefrontTranslator,
  parseAcceptLanguageLocale,
  parseStorefrontLocale,
  resolveStorefrontLocale,
  storefrontLocaleCookieAssignment,
  STOREFRONT_LOCALE_COOKIE,
} from "@/lib/i18n/storefront-locale";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const locales: readonly Locale[] = ["en", "fr", "ar"];

describe("Buyer storefront locale resolution (R4-c)", () => {
  it("resolves precedence query > cookie > Accept-Language > French default", () => {
    // All four authorities present: the query param wins.
    expect(
      resolveStorefrontLocale({
        queryLang: "ar",
        cookieLocale: "fr",
        acceptLanguage: "fr-FR,fr;q=0.9,en;q=0.8",
      }),
    ).toEqual({ locale: "ar", source: "query" });

    // Cookie beats header detection.
    expect(
      resolveStorefrontLocale({
        queryLang: null,
        cookieLocale: "fr",
        acceptLanguage: "ar-DZ,ar;q=0.9",
      }),
    ).toEqual({ locale: "fr", source: "cookie" });

    // Header detection when no explicit preference exists (first visit).
    expect(
      resolveStorefrontLocale({
        queryLang: null,
        cookieLocale: null,
        acceptLanguage: "ar-DZ,ar;q=0.9,fr;q=0.8",
      }),
    ).toEqual({ locale: "ar", source: "accept-language" });

    // Nothing usable: the Algerian-market French default.
    expect(resolveStorefrontLocale({})).toEqual({
      locale: "fr",
      source: "default",
    });
    expect(
      resolveStorefrontLocale({ queryLang: "es", cookieLocale: "it" }),
    ).toEqual({ locale: "fr", source: "default" });
  });

  it("rejects invalid query/cookie values without falling back to them", () => {
    expect(parseStorefrontLocale("ar")).toBe("ar");
    expect(parseStorefrontLocale(" FR ")).toBe("fr");
    expect(parseStorefrontLocale("en-GB")).toBeNull();
    expect(parseStorefrontLocale("")).toBeNull();
    expect(parseStorefrontLocale(null)).toBeNull();
    // An invalid query value must not shadow a valid cookie.
    expect(
      resolveStorefrontLocale({
        queryLang: "de",
        cookieLocale: "ar",
        acceptLanguage: null,
      }),
    ).toEqual({ locale: "ar", source: "cookie" });
  });

  it("maps Accept-Language tags with market weighting (ar-DZ -> ar, fr-DZ -> fr)", () => {
    expect(parseAcceptLanguageLocale("ar-DZ,ar;q=0.9,en;q=0.8")).toBe("ar");
    expect(parseAcceptLanguageLocale("ar")).toBe("ar");
    expect(parseAcceptLanguageLocale("fr-FR,fr;q=0.9,en;q=0.8")).toBe("fr");
    expect(parseAcceptLanguageLocale("en-US,en;q=0.9")).toBe("en");
    // Quality weighting decides before market priority.
    expect(parseAcceptLanguageLocale("fr;q=0.9,ar;q=0.8")).toBe("fr");
    expect(parseAcceptLanguageLocale("ar;q=0.4,fr;q=0.9")).toBe("fr");
    // Equal quality: Algeria-market priority ar > fr > en (Salla/Zid lesson).
    expect(parseAcceptLanguageLocale("fr,ar")).toBe("ar");
    expect(parseAcceptLanguageLocale("en,fr")).toBe("fr");
    // Unsupported languages never map.
    expect(parseAcceptLanguageLocale("es-ES,it;q=0.9")).toBeNull();
    expect(parseAcceptLanguageLocale("")).toBeNull();
    expect(parseAcceptLanguageLocale(null)).toBeNull();
    expect(parseAcceptLanguageLocale("*")).toBeNull();
  });

  it("isolates the buyer cookie from the seller dashboard cookie", () => {
    expect(STOREFRONT_LOCALE_COOKIE).toBe("sf-storefront-locale");
    expect(storefrontLocaleCookieAssignment("ar")).toBe(
      "sf-storefront-locale=ar;path=/;max-age=31536000;samesite=lax",
    );

    // The storefront authority module is isomorphic: it never reads or
    // writes ANY cookie itself (the server page feeds it raw values).
    const authority = read("src/lib/i18n/storefront-locale.ts");
    expect(authority).not.toMatch(/document\.cookie\s*=/);
    expect(authority).not.toContain("next/headers");
    expect(authority).not.toContain('get("sahelflow-locale")');
    expect(authority).not.toContain("sahelflow-locale=");

    // The storefront switcher/provider writes ONLY the storefront cookie.
    const provider = read(
      "src/components/storefront/storefront-locale-provider.tsx",
    );
    expect(provider).toContain("storefrontLocaleCookieAssignment");
    // ...and never writes the seller cookie (comment mentions don't count).
    expect(provider).not.toMatch(/sahelflow-locale\s*=/);

    // The public storefront page reads the buyer cookie, not the seller's.
    const page = read("src/app/storefront/[slug]/page.tsx");
    expect(page).toContain("STOREFRONT_LOCALE_COOKIE");
    // The seller cookie is never read (documentation mentions don't count).
    expect(page).not.toContain('get("sahelflow-locale")');
    expect(page).not.toContain("getI18n");

    // The dashboard locale authority stays untouched by this feature.
    const uiStore = read("src/stores/ui-store.ts");
    expect(uiStore).toContain("sahelflow-locale=");
    expect(uiStore).not.toContain("sf-storefront-locale");
  });

  it("detects without persisting and persists only on explicit switch", () => {
    // Detection path: the server page resolves and renders but never sets a
    // cookie (no cookies().set anywhere in the storefront route files).
    const page = read("src/app/storefront/[slug]/page.tsx");
    expect(page).not.toContain(".set(");

    // The provider persists only inside the explicit setLocale transaction.
    const provider = read(
      "src/components/storefront/storefront-locale-provider.tsx",
    );
    expect(provider).toContain("document.cookie = storefrontLocaleCookieAssignment(next)");
  });

  it("renders a buyer-facing language switcher on the public storefront", () => {
    const view = read("src/components/storefront/storefront-view.tsx");
    expect(view).toContain("<StorefrontLanguageSwitcher />");
    expect(view).toContain("StorefrontLocaleProvider initialLocale={initialLocale}");

    const switcher = read(
      "src/components/storefront/storefront-language-switcher.tsx",
    );
    expect(switcher).toContain('data-storefront-language-switcher="true"');
    expect(switcher).toContain('aria-pressed={active}');
    expect(switcher).toContain('role="group"');
    // All three locales ship with full storefront copy parity (asserted
    // below), so the buyer toggle offers FR, عربية and EN.
    expect(switcher).toContain('{ locale: "fr", label: "FR" }');
    expect(switcher).toContain('{ locale: "ar", label: "عربية" }');
    expect(switcher).toContain('{ locale: "en", label: "EN" }');
    // Switching is a client transaction — no full page reload.
    expect(switcher).toContain("setLocale(entry.locale)");
    expect(switcher).not.toContain("window.location.reload");
    expect(switcher).not.toContain("location.href");
  });

  it("drives direction and language from the buyer locale, not the seller cookie", () => {
    const provider = read(
      "src/components/storefront/storefront-locale-provider.tsx",
    );
    // SSR boundary: the wrapper carries dir/lang while <html> still holds
    // the seller cookie value (nested routes cannot change <html> attrs).
    expect(provider).toContain("dir={dir}");
    expect(provider).toContain("lang={locale}");
    expect(provider).toContain('data-storefront-locale={locale}');
    // Hydration aligns the document boundary with the buyer locale.
    expect(provider).toContain("document.documentElement.dir = getDirection(locale)");
    // Radix portals follow the buyer direction via a nested DirectionProvider.
    expect(provider).toContain("<Direction.Provider dir={dir}>");

    const page = read("src/app/storefront/[slug]/page.tsx");
    expect(page).toContain("initialLocale={buyerLocale}");
    expect(page).toContain("headers()");
    expect(page).toContain("resolveStorefrontLocale");

    // The not-found boundary is buyer-localized too (cookie > header > fr).
    const notFound = read("src/app/storefront/[slug]/not-found.tsx");
    expect(notFound).toContain("resolveStorefrontLocale");
    expect(notFound).toContain("getStorefrontDirection(locale)");
    expect(notFound).not.toContain("getI18n");
  });

  it("keeps the storefront copy authority complete across ar/fr/en (no dotted keys)", () => {
    for (const locale of locales) {
      const bundle = JSON.parse(
        read(`src/lib/i18n/locales/${locale}.json`),
      ) as Record<string, string>;
      const storefrontKeys = Object.keys(bundle).filter((key) =>
        key.startsWith("storefront."),
      );
      // Static bundle: full trilingual parity for buyer-facing copy.
      expect(storefrontKeys.length).toBeGreaterThan(200);
      for (const key of storefrontKeys) {
        expect(
          bundle[key]?.trim(),
          `${locale} storefront key ${key} must be real copy`,
        ).not.toBe("");
      }
    }

    // The only NEW buyer key (switcher group label) lives in the runtime
    // dictionary because locales/*.json are PR #355-owned.
    const runtimeRegistry = read("src/lib/i18n/runtime-translations.ts");
    expect(runtimeRegistry).toContain("getStorefrontRuntimeTranslation");
    for (const locale of locales) {
      const label = getRuntimeTranslation(locale, "storefront.language.label");
      expect(label).toBeTruthy();
      expect(label).not.toBe("storefront.language.label");
    }
  });

  it("translates buyer checkout copy through the storefront translator", () => {
    const success = {
      en: "Order placed successfully",
      fr: "Commande enregistrée",
      ar: "تم تسجيل الطلب بنجاح",
    } as const;
    for (const locale of locales) {
      const t = createStorefrontTranslator(locale);
      const message = t("storefront.view.orderSuccessMessage");
      expect(message).toContain(success[locale]);
      // Count interpolation keeps the same contract as the dashboard t.
      // R5-a: Arabic now resolves the buyer cart through real plural
      // agreement (dual "عنصران" for 2) from plurals-runtime, so the digit
      // expectation only holds for the Latin locales.
      const cartLabel = t("storefront.view.cart", { count: 2 });
      if (locale === "ar") {
        expect(cartLabel).toBe("سلة التسوق (عنصران)");
      } else {
        expect(cartLabel).toContain("2");
      }
      // Missing keys fall back to the raw key (never an empty string).
      // Arabic stabilizes the Latin key with bidi isolates — strip them
      // before comparing so the fallback contract itself is asserted.
      const missing = t("storefront.view.__missing__").replace(
        /[\u2066\u2069]/g,
        "",
      );
      expect(missing).toBe("storefront.view.__missing__");
    }
  });

  it("localizes the COD checkout flow end to end in the buyer locale", () => {
    // The shared renderer resolves copy through the storefront hook and
    // transparently falls back to the dashboard locale for the Studio
    // preview (no provider mounted there).
    const renderer = read("src/components/storefront/storefront-renderer.tsx");
    expect(renderer).toContain("useStorefrontI18n");
    expect(renderer).not.toContain('from "@/hooks/use-i18n"');

    // DZD prices format with the buyer locale (ar -> دج).
    const view = read("src/components/storefront/storefront-view.tsx");
    expect(view).toContain("useStorefrontI18n()");
    expect(view).toContain("formatDZD(itemPrice(item), locale)");
    expect(view).toContain("formatDZD(cartTotal, locale)");
    // Wilaya/commune names + dropdown copy follow the buyer locale.
    expect(view).toContain("<WilayaCommuneSelect");
    expect(view).toContain("locale={locale}");
    // Order confirmation copy is buyer-localized; the API's fixed English
    // string is only a missing-copy fallback.
    expect(view).toContain('localizedSuccess.includes("storefront.view.orderSuccessMessage")');

    // WilayaCommuneSelect: buyer override mounts no dashboard locale
    // transaction (whose document dir effect would fight the storefront),
    // while dashboard callers keep their behavior untouched.
    const wilayaSelect = read(
      "src/components/shared/wilaya-commune-select.tsx",
    );
    expect(wilayaSelect).toContain("locale?: Locale;");
    expect(wilayaSelect).toContain("BuyerLocaleWilayaCommuneSelect");
    expect(wilayaSelect).toContain("createStorefrontTranslator(locale)");
    expect(wilayaSelect).toContain("DashboardWilayaCommuneSelect");

    // Arabic storefront typography does not depend on <html dir> at SSR time.
    const globals = read("src/app/globals.css");
    expect(globals).toContain('[data-storefront-locale="ar"]');
  });

  it("leaves the Studio (seller editor) and dashboard locale system untouched", () => {
    // The renderer fallback keeps the Studio preview on the dashboard locale.
    const provider = read(
      "src/components/storefront/storefront-locale-provider.tsx",
    );
    expect(provider).toContain("dashboard = useI18n()");

    // No storefront provider is mounted inside the Studio preview path.
    const saharaPreview = read(
      "src/components/storefront/studio/sahara-preview.tsx",
    );
    expect(saharaPreview).not.toContain("StorefrontLocaleProvider");
  });
});
