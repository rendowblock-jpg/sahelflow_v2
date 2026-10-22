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
    "storefront.shop.skip": "Skip to content",
    "storefront.shop.tabHome": "Home",
    "storefront.shop.tabNav": "Quick navigation",
    "storefront.shop.from": "From {{price}}",
    "storefront.shop.photo": "Photo {{n}} of {{total}}",
    "storefront.shop.choose": "Choose…",
    "storefront.shop.loading": "Loading…",
    "storefront.shop.subtotal": "Subtotal",
    "storefront.shop.summary": "Order summary",
    "storefront.shop.pickFirst": "Choose your wilaya to see it",
    "storefront.shop.chooseWilaya": "Please choose your wilaya.",
    "storefront.shop.chooseCommune": "Please choose your commune.",
    "storefront.shop.addressShort": "Please enter your full address.",
    "storefront.shop.fixFields": "Please fix the highlighted fields.",
    "storefront.shop.soldOutNow": "Sorry, this item has just sold out or fewer are left.",
    "storefront.shop.tooMany": "Too many attempts. Please wait a minute and try again.",
    "storefront.shop.paused": "Orders are paused right now. Please try again shortly.",
    "storefront.shop.retry": "We could not send your order. Check your connection and tap again: nothing will be duplicated.",
    "storefront.shop.needJs": "Please enable JavaScript to place your order.",
    "storefront.shop.thanksNext": "We will call you shortly to confirm your order.",
    "storefront.shop.confirmWhatsapp": "Confirm on WhatsApp",
    "storefront.shop.details": "Details",
    "storefront.shop.stepContact": "Your details",
    "storefront.shop.stepDelivery": "Delivery",
    "storefront.shop.whatsappMessage": "Hello! I just ordered {{product}} ×{{count}} (ref. {{ref}}).",
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
    "storefront.shop.skip": "Aller au contenu",
    "storefront.shop.tabHome": "Accueil",
    "storefront.shop.tabNav": "Navigation rapide",
    "storefront.shop.from": "À partir de {{price}}",
    "storefront.shop.photo": "Photo {{n}} sur {{total}}",
    "storefront.shop.choose": "Choisir…",
    "storefront.shop.loading": "Chargement…",
    "storefront.shop.subtotal": "Sous-total",
    "storefront.shop.summary": "Récapitulatif de la commande",
    "storefront.shop.pickFirst": "Choisissez votre wilaya",
    "storefront.shop.chooseWilaya": "Veuillez choisir votre wilaya.",
    "storefront.shop.chooseCommune": "Veuillez choisir votre commune.",
    "storefront.shop.addressShort": "Veuillez saisir votre adresse complète.",
    "storefront.shop.fixFields": "Veuillez corriger les champs signalés.",
    "storefront.shop.soldOutNow": "Désolé, cet article vient de s'épuiser ou il n'en reste plus assez.",
    "storefront.shop.tooMany": "Trop de tentatives. Patientez une minute puis réessayez.",
    "storefront.shop.paused": "Les commandes sont en pause. Réessayez dans un instant.",
    "storefront.shop.retry": "Nous n'avons pas pu envoyer votre commande. Vérifiez votre connexion puis appuyez à nouveau : rien ne sera dupliqué.",
    "storefront.shop.needJs": "Activez JavaScript pour passer commande.",
    "storefront.shop.thanksNext": "Nous vous appelons très bientôt pour confirmer votre commande.",
    "storefront.shop.confirmWhatsapp": "Confirmer sur WhatsApp",
    "storefront.shop.details": "Détails",
    "storefront.shop.stepContact": "Vos coordonnées",
    "storefront.shop.stepDelivery": "Livraison",
    "storefront.shop.whatsappMessage": "Bonjour ! Je viens de commander {{product}} ×{{count}} (réf. {{ref}}).",
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
    "storefront.shop.skip": "انتقل إلى المحتوى",
    "storefront.shop.tabHome": "الرئيسية",
    "storefront.shop.tabNav": "التنقل السريع",
    "storefront.shop.from": "ابتداءً من {{price}}",
    "storefront.shop.photo": "الصورة {{n}} من {{total}}",
    "storefront.shop.choose": "اختر…",
    "storefront.shop.loading": "جارٍ التحميل…",
    "storefront.shop.subtotal": "المجموع الفرعي",
    "storefront.shop.summary": "ملخص الطلب",
    "storefront.shop.pickFirst": "اختر ولايتك لمعرفة السعر",
    "storefront.shop.chooseWilaya": "يرجى اختيار الولاية.",
    "storefront.shop.chooseCommune": "يرجى اختيار البلدية.",
    "storefront.shop.addressShort": "يرجى إدخال عنوانك كاملاً.",
    "storefront.shop.fixFields": "يرجى تصحيح الحقول المحددة.",
    "storefront.shop.soldOutNow": "عذراً، نفد هذا المنتج للتو أو لم تعد الكمية كافية.",
    "storefront.shop.tooMany": "محاولات كثيرة. انتظر دقيقة ثم حاول مرة أخرى.",
    "storefront.shop.paused": "الطلبات متوقفة مؤقتاً. حاول مرة أخرى بعد قليل.",
    "storefront.shop.retry": "تعذّر إرسال طلبك. تحقق من الاتصال ثم اضغط مرة أخرى: لن يتكرر الطلب.",
    "storefront.shop.needJs": "فعّل جافاسكريبت لإتمام الطلب.",
    "storefront.shop.thanksNext": "سنتصل بك قريباً لتأكيد طلبك.",
    "storefront.shop.confirmWhatsapp": "أكّد عبر واتساب",
    "storefront.shop.details": "التفاصيل",
    "storefront.shop.stepContact": "بياناتك",
    "storefront.shop.stepDelivery": "التوصيل",
    "storefront.shop.whatsappMessage": "مرحباً! لقد طلبت للتو {{product}} ×{{count}} (المرجع {{ref}}).",
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
