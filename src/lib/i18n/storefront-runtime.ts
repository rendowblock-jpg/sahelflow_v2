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
    "storefront.public.notFoundTitle": "Store not found",
    "storefront.public.notFoundBody": "Check the link, or ask the seller for a new one.",
    "storefront.public.pausedTitle": "Store temporarily closed",
    "storefront.public.pausedBody": "Please come back soon: the store will reopen shortly.",
    "storefront.public.errorTitle": "This store cannot be shown right now",
    "storefront.public.errorBody": "Please try again in a few minutes.",
    "storefront.public.metaFallback": "{{name}}: order online and pay cash on delivery.",
    "storefront.releaseHistory.title": "Release history",
    "storefront.releaseHistory.description":
      "Every publish is kept as its own version. Going back to an older version publishes it again as a new version.",
    "storefront.releaseHistory.current": "Current",
    "storefront.releaseHistory.rollback": "Rollback",
    "storefront.releaseHistory.rollingBack": "Rolling back…",
    "storefront.releaseHistory.confirm":
      "Publish a new live release from this historical version? Your private Studio draft will stay unchanged.",
    "storefront.releaseHistory.empty": "No published releases yet.",
    "storefront.releaseHistory.loading": "Loading release history…",
    "storefront.releaseHistory.loadFailed": "Could not load release history.",
    "storefront.releaseHistory.notConnected":
      "Release history appears here once this store is published online with SahelFlow.",
    "storefront.releaseHistory.rollbackFailed":
      "Rollback failed. The current live release was kept.",
    "storefront.releaseHistory.rolledBack":
      "The older version is live again, published as a new version.",
    "storefront.releaseHistory.products": "items",
  },
  fr: {
    "storefront.language.label": "Langue",
    "storefront.public.notFoundTitle": "Boutique introuvable",
    "storefront.public.notFoundBody": "Vérifiez le lien ou demandez-en un nouveau au vendeur.",
    "storefront.public.pausedTitle": "Boutique temporairement fermée",
    "storefront.public.pausedBody": "Revenez bientôt : la boutique rouvrira prochainement.",
    "storefront.public.errorTitle": "Cette boutique ne peut pas s'afficher pour le moment",
    "storefront.public.errorBody": "Veuillez réessayer dans quelques minutes.",
    "storefront.public.metaFallback": "{{name}} : commandez en ligne et payez à la livraison.",
    "storefront.releaseHistory.title": "Historique des versions",
    "storefront.releaseHistory.description":
      "Chaque publication est conservée comme une version. Revenir à une ancienne version la republie comme nouvelle version.",
    "storefront.releaseHistory.current": "Actuelle",
    "storefront.releaseHistory.rollback": "Restaurer",
    "storefront.releaseHistory.rollingBack": "Restauration…",
    "storefront.releaseHistory.confirm":
      "Publier une nouvelle version active depuis cette version historique ? Votre brouillon Studio privé restera inchangé.",
    "storefront.releaseHistory.empty": "Aucune version publiée pour le moment.",
    "storefront.releaseHistory.loading": "Chargement de l’historique…",
    "storefront.releaseHistory.loadFailed":
      "Impossible de charger l’historique des versions.",
    "storefront.releaseHistory.notConnected":
      "L’historique des versions apparaît ici dès que cette boutique est publiée en ligne avec SahelFlow.",
    "storefront.releaseHistory.rollbackFailed":
      "La restauration a échoué. La version active actuelle a été conservée.",
    "storefront.releaseHistory.rolledBack":
      "L’ancienne version est de nouveau en ligne, publiée comme nouvelle version.",
    "storefront.releaseHistory.products": "articles",
  },
  ar: {
    "storefront.language.label": "اللغة",
    "storefront.public.notFoundTitle": "المتجر غير موجود",
    "storefront.public.notFoundBody": "تحقّق من الرابط أو اطلب من البائع رابطاً جديداً.",
    "storefront.public.pausedTitle": "المتجر مغلق مؤقتاً",
    "storefront.public.pausedBody": "عُد قريباً، سيفتح المتجر أبوابه من جديد بعد قليل.",
    "storefront.public.errorTitle": "تعذّر عرض هذا المتجر حالياً",
    "storefront.public.errorBody": "يرجى المحاولة مرة أخرى بعد بضع دقائق.",
    "storefront.public.metaFallback": "{{name}}: اطلب أونلاين والدفع عند الاستلام.",
    "storefront.releaseHistory.title": "سجل الإصدارات",
    "storefront.releaseHistory.description":
      "تُحفظ كل عملية نشر كإصدار مستقل. الرجوع إلى إصدار قديم يعيد نشره كإصدار جديد.",
    "storefront.releaseHistory.current": "الحالي",
    "storefront.releaseHistory.rollback": "استرجاع",
    "storefront.releaseHistory.rollingBack": "جارٍ الاسترجاع…",
    "storefront.releaseHistory.confirm":
      "هل تريد نشر إصدار حي جديد من هذه النسخة التاريخية؟ ستبقى مسودة Studio الخاصة بك دون تغيير.",
    "storefront.releaseHistory.empty": "لا توجد إصدارات منشورة بعد.",
    "storefront.releaseHistory.loading": "جارٍ تحميل سجل الإصدارات…",
    "storefront.releaseHistory.loadFailed": "تعذر تحميل سجل الإصدارات.",
    "storefront.releaseHistory.notConnected":
      "يظهر سجل الإصدارات هنا بمجرد نشر هذا المتجر على الإنترنت عبر SahelFlow.",
    "storefront.releaseHistory.rollbackFailed":
      "فشل الاسترجاع. تم الإبقاء على الإصدار الحي الحالي.",
    "storefront.releaseHistory.rolledBack":
      "عاد الإصدار القديم إلى النشر كإصدار جديد.",
    "storefront.releaseHistory.products": "عناصر",
  },
};

export function getStorefrontRuntimeTranslation(
  locale: Locale,
  key: string,
): string | undefined {
  return translations[locale][key];
}
