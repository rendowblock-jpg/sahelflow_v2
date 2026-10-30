import type { Locale } from "@/lib/i18n";

/**
 * Copy for the exit from a stuck courier booking (audit S03c-08): the
 * "Needs your decision" state and its two actions on the deliveries list and
 * the delivery page.
 */
const translations: Record<Locale, Record<string, string>> = {
  ar: {
    "deliveries.reconcile.needsDecision": "بانتظار قرارك",
    "deliveries.reconcile.title": "هل استلمت شركة التوصيل هذا الطرد؟",
    "deliveries.reconcile.description":
      "لم تردّ شركة التوصيل في الوقت المناسب، لذلك لا يستطيع SahelFlow معرفة هل سُجّل الطرد. افتح تطبيق شركة التوصيل أو موقعها وتحقّق، ثم اختر.",
    "deliveries.reconcile.courierHasIt": "شركة التوصيل استلمت الطرد",
    "deliveries.reconcile.trackingLabel": "رقم التتبّع من شركة التوصيل",
    "deliveries.reconcile.trackingHint":
      "انسخه من تطبيق شركة التوصيل أو من موقعها.",
    "deliveries.reconcile.trackingInvalid": "أدخل رقم التتبّع بدون مسافات.",
    "deliveries.reconcile.saveTracking": "حفظ رقم التتبّع",
    "deliveries.reconcile.bookAgain": "حجز من جديد",
    "deliveries.reconcile.confirmTitle": "حجز هذا الطرد من جديد؟",
    "deliveries.reconcile.confirmBody":
      "إذا كان الطلب الأول قد وصل فعلاً إلى شركة التوصيل، فسيُنشأ طرد ثان ورسم توصيل ثان. تحقّق أولاً من تطبيق شركة التوصيل أو موقعها.",
    "deliveries.reconcile.confirmAction": "نعم، احجز من جديد",
    "deliveries.reconcile.cancel": "إلغاء",
    "deliveries.reconcile.savedOk":
      "تم حفظ رقم التتبّع. أصبح الطلب في حالة «تم الشحن».",
    "deliveries.reconcile.alreadySaved": "رقم التتبّع هذا محفوظ من قبل.",
    "deliveries.reconcile.bookedOk": "تم الحجز من جديد.",
    "deliveries.reconcile.releasedOnly":
      "تم مسح المحاولة السابقة لكن الحجز الجديد لم يكتمل. جرّب الحجز من صفحة الطلب.",
    "deliveries.reconcile.failed": "تعذّر إكمال العملية. لم يتغيّر شيء.",
    "deliveries.reconcile.canonicalHint":
      "هذا الطلب يستخدم مسار شركة التوصيل الجديد. اتخذ القرار من صفحة الطلب.",
    "deliveries.reconcile.openOrder": "فتح الطلب",
    "deliveries.reconcile.decide": "اتخاذ قرار",
  },
  fr: {
    "deliveries.reconcile.needsDecision": "À vous de décider",
    "deliveries.reconcile.title": "Le transporteur a-t-il reçu ce colis ?",
    "deliveries.reconcile.description":
      "Le transporteur n’a pas répondu à temps : SahelFlow ne sait pas si le colis a été enregistré. Vérifiez dans l’application ou sur le site de votre transporteur, puis choisissez.",
    "deliveries.reconcile.courierHasIt": "Le transporteur l’a",
    "deliveries.reconcile.trackingLabel":
      "Numéro de suivi donné par votre transporteur",
    "deliveries.reconcile.trackingHint":
      "Copiez-le depuis l’application ou le site de votre transporteur.",
    "deliveries.reconcile.trackingInvalid":
      "Saisissez le numéro de suivi sans espaces.",
    "deliveries.reconcile.saveTracking": "Enregistrer le numéro de suivi",
    "deliveries.reconcile.bookAgain": "Réserver à nouveau",
    "deliveries.reconcile.confirmTitle": "Réserver à nouveau ce colis ?",
    "deliveries.reconcile.confirmBody":
      "Si la première demande est bien arrivée chez le transporteur, une nouvelle réservation créera un deuxième colis et des frais en double. Vérifiez d’abord dans l’application ou sur le site de votre transporteur.",
    "deliveries.reconcile.confirmAction": "Oui, réserver à nouveau",
    "deliveries.reconcile.cancel": "Annuler",
    "deliveries.reconcile.savedOk":
      "Numéro de suivi enregistré. La commande est maintenant expédiée.",
    "deliveries.reconcile.alreadySaved":
      "Ce numéro de suivi était déjà enregistré.",
    "deliveries.reconcile.bookedOk": "Réservation refaite.",
    "deliveries.reconcile.releasedOnly":
      "L’ancienne tentative a été effacée, mais la nouvelle réservation n’a pas abouti. Réessayez depuis la commande.",
    "deliveries.reconcile.failed":
      "Impossible de terminer. Rien n’a été modifié.",
    "deliveries.reconcile.canonicalHint":
      "Cette commande utilise le nouveau circuit transporteur. Décidez depuis la page de la commande.",
    "deliveries.reconcile.openOrder": "Ouvrir la commande",
    "deliveries.reconcile.decide": "Décider",
  },
  en: {
    "deliveries.reconcile.needsDecision": "Needs your decision",
    "deliveries.reconcile.title": "Did the courier get this parcel?",
    "deliveries.reconcile.description":
      "The courier did not answer in time, so SahelFlow cannot tell whether the parcel was booked. Check your courier’s own app or website, then choose.",
    "deliveries.reconcile.courierHasIt": "The courier has it",
    "deliveries.reconcile.trackingLabel": "Tracking number from your courier",
    "deliveries.reconcile.trackingHint":
      "Copy it from your courier’s app or website.",
    "deliveries.reconcile.trackingInvalid":
      "Enter the tracking number without spaces.",
    "deliveries.reconcile.saveTracking": "Save tracking number",
    "deliveries.reconcile.bookAgain": "Book again",
    "deliveries.reconcile.confirmTitle": "Book this parcel again?",
    "deliveries.reconcile.confirmBody":
      "If the first request did reach the courier, booking again creates a second parcel and a second fee. Check your courier’s app or website first.",
    "deliveries.reconcile.confirmAction": "Yes, book again",
    "deliveries.reconcile.cancel": "Cancel",
    "deliveries.reconcile.savedOk":
      "Tracking number saved. The order is now shipped.",
    "deliveries.reconcile.alreadySaved":
      "This tracking number was already saved.",
    "deliveries.reconcile.bookedOk": "Booked again.",
    "deliveries.reconcile.releasedOnly":
      "The old attempt was cleared, but the new booking did not go through. Try booking from the order.",
    "deliveries.reconcile.failed": "Could not complete this. Nothing was changed.",
    "deliveries.reconcile.canonicalHint":
      "This order uses the newer courier flow. Decide on the order page.",
    "deliveries.reconcile.openOrder": "Open the order",
    "deliveries.reconcile.decide": "Decide",
  },
};

export function getDeliveryReconcileRuntimeTranslation(
  locale: Locale,
  key: string,
): string | undefined {
  return translations[locale][key];
}
