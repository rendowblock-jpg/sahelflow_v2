import type { Locale } from "@/lib/i18n";

/**
 * Words for the first-run path (setup, login, join, onboarding, notifications) that the shared catalogs do not
 * have yet. Integration status wording follows marketing/src/claims.mjs STATUS_LABEL: nothing here may say more
 * than "in testing" for WhatsApp, couriers or shop connectors.
 */
const COPY = {
  en: {
    "firstRun.onboarding.nameRequired": "Enter your shop name to continue.",
    "firstRun.error.unmapped": "Something went wrong on our side. Please try again in a moment.",
    "firstRun.join.invalidTitle": "This invitation can’t be used",
    "firstRun.join.invalidBody": "It may have expired, been used already, or been cancelled by the owner.",
    "firstRun.join.invalidNext": "Ask the workspace owner for a new invitation link, then paste it here.",
    "firstRun.whatsapp.laterTitle": "WhatsApp is not connected yet",
    "firstRun.whatsapp.laterBody": "You can connect it later from the Inbox. The rest of setup works without it.",
    "firstRun.whatsapp.laterCheck": "Check again",
    "firstRun.integration.testing": "In testing",
    "firstRun.notifications.loadFailedBody": "We could not load your notifications. Your data is safe; try again.",
  },
  fr: {
    "firstRun.onboarding.nameRequired": "Saisissez le nom de votre boutique pour continuer.",
    "firstRun.error.unmapped": "Un problème est survenu de notre côté. Réessayez dans un instant.",
    "firstRun.join.invalidTitle": "Cette invitation n’est plus utilisable",
    "firstRun.join.invalidBody": "Elle a peut-être expiré, déjà été utilisée ou annulée par le propriétaire.",
    "firstRun.join.invalidNext": "Demandez au propriétaire un nouveau lien d’invitation, puis collez-le ici.",
    "firstRun.whatsapp.laterTitle": "WhatsApp n’est pas encore connecté",
    "firstRun.whatsapp.laterBody": "Vous pourrez le connecter plus tard depuis la messagerie. Le reste de la configuration fonctionne sans.",
    "firstRun.whatsapp.laterCheck": "Vérifier à nouveau",
    "firstRun.integration.testing": "En test",
    "firstRun.notifications.loadFailedBody": "Impossible de charger les notifications. Vos données sont intactes, réessayez.",
  },
  ar: {
    "firstRun.onboarding.nameRequired": "أدخل اسم متجرك للمتابعة.",
    "firstRun.error.unmapped": "حدث خطأ من جانبنا. حاول مرة أخرى بعد قليل.",
    "firstRun.join.invalidTitle": "لا يمكن استعمال هذه الدعوة",
    "firstRun.join.invalidBody": "ربما انتهت صلاحيتها، أو استُعملت من قبل، أو ألغاها المالك.",
    "firstRun.join.invalidNext": "اطلب من مالك مساحة العمل رابط دعوة جديدًا ثم الصقه هنا.",
    "firstRun.whatsapp.laterTitle": "واتساب غير مرتبط بعد",
    "firstRun.whatsapp.laterBody": "يمكنك ربطه لاحقًا من صندوق الرسائل. باقي خطوات الإعداد تعمل بدونه.",
    "firstRun.whatsapp.laterCheck": "تحقق مجددًا",
    "firstRun.integration.testing": "قيد الاختبار",
    "firstRun.notifications.loadFailedBody": "تعذر تحميل الإشعارات. بياناتك سليمة، حاول مرة أخرى.",
  },
} as const satisfies Record<Locale, Record<string, string>>;

export function getFirstRunStatesRuntimeTranslation(locale: Locale, key: string): string | undefined {
  return (COPY[locale] as Readonly<Record<string, string>>)[key];
}
