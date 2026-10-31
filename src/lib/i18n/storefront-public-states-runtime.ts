import type { Locale } from "@/lib/i18n";

/**
 * Words for the hosted store's calm pages: a product that is gone, and the one exit each notice offers.
 * The Worker's message table (messages.generated.json) is built from these by scripts/storefront-public-build.ts.
 */
const translations: Record<Locale, Record<string, string>> = {
  en: {
    "storefront.public.productNotFoundTitle": "This product is not available",
    "storefront.public.productNotFoundBody": "It may have been removed. The rest of the shop is still open.",
    "storefront.public.exitProducts": "See the whole shop",
    "storefront.public.exitRecheck": "Check again",
    "storefront.public.exitReload": "Reload this page",
  },
  fr: {
    "storefront.public.productNotFoundTitle": "Ce produit n’est pas disponible",
    "storefront.public.productNotFoundBody": "Il a peut-être été retiré. Le reste de la boutique est toujours ouvert.",
    "storefront.public.exitProducts": "Voir toute la boutique",
    "storefront.public.exitRecheck": "Vérifier à nouveau",
    "storefront.public.exitReload": "Recharger la page",
  },
  ar: {
    "storefront.public.productNotFoundTitle": "هذا المنتج غير متوفر",
    "storefront.public.productNotFoundBody": "ربما تم حذفه. بقية المتجر ما زالت مفتوحة.",
    "storefront.public.exitProducts": "تصفّح المتجر كله",
    "storefront.public.exitRecheck": "تحقّق مرة أخرى",
    "storefront.public.exitReload": "أعد تحميل الصفحة",
  },
};

export function getStorefrontPublicStatesRuntimeTranslation(locale: Locale, key: string): string | undefined {
  return translations[locale][key];
}
