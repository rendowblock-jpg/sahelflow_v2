import type { Locale } from "@/lib/i18n";

/**
 * Runtime dictionary for buyer-facing storefront copy (R4-c) and the studio
 * release-history workspace (R5-d).
 *
 * The 236 static `storefront.*` keys already ship with full ar/fr/en parity
 * in src/lib/i18n/locales/*.json, so only switcher-owned and release-history
 * copy lives here (the release-history COPY dictionary migrated verbatim
 * from storefront-release-history.tsx). Keys are candidates for promotion
 * into the locale JSON bundle during the central locale pass (locales/*.json
 * are PR #355-owned).
 */
const translations: Record<Locale, Record<string, string>> = {
  en: {
    "storefront.language.label": "Language",
    "storefront.releaseHistory.title": "Release history",
    "storefront.releaseHistory.description":
      "Every publish is immutable. Rollback creates a new release from a verified historical version.",
    "storefront.releaseHistory.current": "Current",
    "storefront.releaseHistory.rollback": "Rollback",
    "storefront.releaseHistory.rollingBack": "Rolling back…",
    "storefront.releaseHistory.confirm":
      "Publish a new live release from this historical version? Your private Studio draft will stay unchanged.",
    "storefront.releaseHistory.empty": "No published releases yet.",
    "storefront.releaseHistory.loading": "Loading release history…",
    "storefront.releaseHistory.loadFailed": "Could not load release history.",
    "storefront.releaseHistory.rollbackFailed":
      "Rollback failed. The current live release was kept.",
    "storefront.releaseHistory.rolledBack":
      "Rollback published as a new immutable release.",
    "storefront.releaseHistory.products": "items",
  },
  fr: {
    "storefront.language.label": "Langue",
    "storefront.releaseHistory.title": "Historique des versions",
    "storefront.releaseHistory.description":
      "Chaque publication est immuable. Le retour arrière crée une nouvelle version depuis une version historique vérifiée.",
    "storefront.releaseHistory.current": "Actuelle",
    "storefront.releaseHistory.rollback": "Restaurer",
    "storefront.releaseHistory.rollingBack": "Restauration…",
    "storefront.releaseHistory.confirm":
      "Publier une nouvelle version active depuis cette version historique ? Votre brouillon Studio privé restera inchangé.",
    "storefront.releaseHistory.empty": "Aucune version publiée pour le moment.",
    "storefront.releaseHistory.loading": "Chargement de l’historique…",
    "storefront.releaseHistory.loadFailed":
      "Impossible de charger l’historique des versions.",
    "storefront.releaseHistory.rollbackFailed":
      "La restauration a échoué. La version active actuelle a été conservée.",
    "storefront.releaseHistory.rolledBack":
      "La restauration a été publiée comme une nouvelle version immuable.",
    "storefront.releaseHistory.products": "articles",
  },
  ar: {
    "storefront.language.label": "اللغة",
    "storefront.releaseHistory.title": "سجل الإصدارات",
    "storefront.releaseHistory.description":
      "كل نشر غير قابل للتعديل. الاسترجاع ينشئ إصدارًا جديدًا من نسخة تاريخية موثّقة.",
    "storefront.releaseHistory.current": "الحالي",
    "storefront.releaseHistory.rollback": "استرجاع",
    "storefront.releaseHistory.rollingBack": "جارٍ الاسترجاع…",
    "storefront.releaseHistory.confirm":
      "هل تريد نشر إصدار حي جديد من هذه النسخة التاريخية؟ ستبقى مسودة Studio الخاصة بك دون تغيير.",
    "storefront.releaseHistory.empty": "لا توجد إصدارات منشورة بعد.",
    "storefront.releaseHistory.loading": "جارٍ تحميل سجل الإصدارات…",
    "storefront.releaseHistory.loadFailed": "تعذر تحميل سجل الإصدارات.",
    "storefront.releaseHistory.rollbackFailed":
      "فشل الاسترجاع. تم الإبقاء على الإصدار الحي الحالي.",
    "storefront.releaseHistory.rolledBack":
      "تم نشر الاسترجاع كإصدار جديد غير قابل للتعديل.",
    "storefront.releaseHistory.products": "عناصر",
  },
};

export function getStorefrontRuntimeTranslation(
  locale: Locale,
  key: string,
): string | undefined {
  return translations[locale][key];
}
