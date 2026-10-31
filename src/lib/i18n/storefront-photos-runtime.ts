import type { Locale } from "@/lib/i18n";

/**
 * Copy for the state of a product photo in the online store (hosted, waiting,
 * only on this PC, missing) and for the reasons a publish stops on a photo.
 * Wording is exact: "hosted" means the SahelFlow service holds the photo, never
 * that the store is live; "waiting" never says "uploaded".
 */
const translations: Record<Locale, Record<string, string>> = {
  en: {
    "storefront.photos.hosted": "Photo hosted",
    "storefront.photos.waiting": "Photo waiting to upload",
    "storefront.photos.localOnly": "Photo only on this PC (not shown to buyers yet)",
    "storefront.photos.missing": "The file of this photo is missing on this PC. Choose it again.",
    "storefront.photos.checking": "Checking photos…",
    "storefront.photos.checkFailed": "Could not check photos",
    "storefront.photos.retry": "Try again",
    "storefront.photos.sending": "Sending photos {{done}} of {{total}}",
    "storefront.photos.publishedOnlyHere": "Photos only on this PC (not shown to buyers yet): {{count}}",
    "storefront.photos.publishedMissing": "Photos whose file is missing on this PC (not shown to buyers): {{count}}",
    "storefront.photos.fail.HOSTING_BUSY": "Your store was not published: the photo service is busy or cannot be reached. Try again in a moment.",
    "storefront.photos.fail.HOSTING_QUOTA": "Your store was not published: your photo space is full. Remove some photos and try again.",
    "storefront.photos.fail.HOSTING_REFUSED": "Your store was not published: the photo service refused a photo.",
    "storefront.photos.fail.PHOTO_TOO_DETAILED": "Your store was not published: a photo is too detailed to send. Choose a simpler or smaller photo.",
    "storefront.photos.fail.PHOTO_UNREADABLE": "Your store was not published: a photo could not be read. Choose that photo again.",
    "storefront.photos.fail.MEDIA_CONTRACT_CHANGED": "Your store was not published: the photo service answered in a way this version of the app does not understand. Update the app and try again.",
  },
  fr: {
    "storefront.photos.hosted": "Photo hébergée",
    "storefront.photos.waiting": "Photo en attente d’envoi",
    "storefront.photos.localOnly": "Photo seulement sur ce PC (pas encore visible par les acheteurs)",
    "storefront.photos.missing": "Le fichier de cette photo est introuvable sur ce PC. Choisissez-la à nouveau.",
    "storefront.photos.checking": "Vérification des photos…",
    "storefront.photos.checkFailed": "Impossible de vérifier les photos",
    "storefront.photos.retry": "Réessayer",
    "storefront.photos.sending": "Envoi des photos : {{done}} sur {{total}}",
    "storefront.photos.publishedOnlyHere": "Photos seulement sur ce PC (pas encore visibles par les acheteurs) : {{count}}",
    "storefront.photos.publishedMissing": "Photos dont le fichier est introuvable sur ce PC (pas visibles par les acheteurs) : {{count}}",
    "storefront.photos.fail.HOSTING_BUSY": "Boutique non publiée : le service de photos est occupé ou injoignable. Réessayez dans un instant.",
    "storefront.photos.fail.HOSTING_QUOTA": "Boutique non publiée : votre espace photos est plein. Supprimez quelques photos et réessayez.",
    "storefront.photos.fail.HOSTING_REFUSED": "Boutique non publiée : le service de photos a refusé une photo.",
    "storefront.photos.fail.PHOTO_TOO_DETAILED": "Boutique non publiée : une photo est trop détaillée pour être envoyée. Choisissez une photo plus simple ou plus petite.",
    "storefront.photos.fail.PHOTO_UNREADABLE": "Boutique non publiée : une photo n’a pas pu être lue. Choisissez-la à nouveau.",
    "storefront.photos.fail.MEDIA_CONTRACT_CHANGED": "Boutique non publiée : le service de photos a répondu d’une façon que cette version de l’application ne comprend pas. Mettez l’application à jour et réessayez.",
  },
  ar: {
    "storefront.photos.hosted": "الصورة مستضافة",
    "storefront.photos.waiting": "الصورة بانتظار الرفع",
    "storefront.photos.localOnly": "الصورة على هذا الحاسوب فقط (لا يراها المشترون بعد)",
    "storefront.photos.missing": "ملف هذه الصورة غير موجود على هذا الحاسوب. اخترها من جديد.",
    "storefront.photos.checking": "جارٍ فحص الصور…",
    "storefront.photos.checkFailed": "تعذّر فحص الصور",
    "storefront.photos.retry": "حاول مرة أخرى",
    "storefront.photos.sending": "إرسال الصور: {{done}} من {{total}}",
    "storefront.photos.publishedOnlyHere": "صور على هذا الحاسوب فقط (لا يراها المشترون بعد): {{count}}",
    "storefront.photos.publishedMissing": "صور ملفها غير موجود على هذا الحاسوب (لا يراها المشترون): {{count}}",
    "storefront.photos.fail.HOSTING_BUSY": "لم يُنشر متجرك: خدمة الصور مشغولة أو لا يمكن الوصول إليها. حاول بعد لحظات.",
    "storefront.photos.fail.HOSTING_QUOTA": "لم يُنشر متجرك: مساحة الصور ممتلئة. احذف بعض الصور وحاول مرة أخرى.",
    "storefront.photos.fail.HOSTING_REFUSED": "لم يُنشر متجرك: رفضت خدمة الصور إحدى الصور.",
    "storefront.photos.fail.PHOTO_TOO_DETAILED": "لم يُنشر متجرك: إحدى الصور شديدة التفاصيل ولا يمكن إرسالها. اختر صورة أبسط أو أصغر.",
    "storefront.photos.fail.PHOTO_UNREADABLE": "لم يُنشر متجرك: تعذّرت قراءة إحدى الصور. اخترها من جديد.",
    "storefront.photos.fail.MEDIA_CONTRACT_CHANGED": "لم يُنشر متجرك: ردّت خدمة الصور بطريقة لا يفهمها هذا الإصدار من التطبيق. حدّث التطبيق وحاول مرة أخرى.",
  },
};

export function getStorefrontPhotosRuntimeTranslation(locale: Locale, key: string): string | undefined {
  return translations[locale][key];
}
