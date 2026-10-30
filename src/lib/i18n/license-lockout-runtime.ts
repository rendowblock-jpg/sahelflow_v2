import type { Locale } from "@/lib/i18n";

/**
 * Copy of the "Your data is yours" section of the licence lockout screen
 * (IDN-03): download the records, make a backup, with a licence that lapsed.
 * Entity names follow the sidebar words (nav.*) of each language.
 */
const translations: Record<Locale, Record<string, string>> = {
  en: {
    "license.lockout.data.title": "Your data is yours",
    "license.lockout.data.description":
      "Your orders and customers stay on this computer. Without a licence you can still download them or save a backup copy.",
    "license.lockout.data.downloadTitle": "Download my data",
    "license.lockout.data.downloadHint": "One file per list. Opens in Excel or Google Sheets.",
    "license.lockout.data.entity.orders": "Orders",
    "license.lockout.data.entity.customers": "Customers",
    "license.lockout.data.entity.products": "Products",
    "license.lockout.data.entity.deliveries": "Deliveries",
    "license.lockout.data.entity.returns": "Returns",
    "license.lockout.data.entity.expenses": "Expenses",
    "license.lockout.data.preparing": "Preparing your {{name}} file…",
    "license.lockout.data.downloaded": "Your {{name}} file is downloading. Check your downloads.",
    "license.lockout.data.backupTitle": "Keep a safe copy",
    "license.lockout.data.backupDescription":
      "Saves a backup of your whole shop on this computer. It does not change or delete anything.",
    "license.lockout.data.backupButton": "Create a backup now",
    "license.lockout.data.backupBusy": "Creating your backup…",
    "license.lockout.data.backupDone":
      "Backup created and checked. It is saved on this computer.",
    "license.lockout.data.backupDoneSize":
      "Backup created and checked ({{size}}). It is saved on this computer.",
    "license.lockout.data.error.signIn": "Please sign in first, then try again.",
    "license.lockout.data.error.forbidden":
      "Your account is not allowed to do this. Ask the shop owner.",
    "license.lockout.data.error.failed":
      "That did not work and nothing was changed. Please try again.",
    "license.lockout.data.error.network":
      "SahelFlow could not be reached on this computer. Please try again.",
    "license.lockout.data.signIn": "Sign in",
  },
  fr: {
    "license.lockout.data.title": "Vos données vous appartiennent",
    "license.lockout.data.description":
      "Vos commandes et vos clients restent sur cet ordinateur. Sans licence, vous pouvez toujours les télécharger ou enregistrer une copie de sauvegarde.",
    "license.lockout.data.downloadTitle": "Télécharger mes données",
    "license.lockout.data.downloadHint":
      "Un fichier par liste. Il s’ouvre dans Excel ou Google Sheets.",
    "license.lockout.data.entity.orders": "Commandes",
    "license.lockout.data.entity.customers": "Clients",
    "license.lockout.data.entity.products": "Produits",
    "license.lockout.data.entity.deliveries": "Livraisons",
    "license.lockout.data.entity.returns": "Retours",
    "license.lockout.data.entity.expenses": "Dépenses",
    "license.lockout.data.preparing": "Préparation du fichier « {{name}} »…",
    "license.lockout.data.downloaded":
      "Le fichier « {{name}} » se télécharge. Regardez vos téléchargements.",
    "license.lockout.data.backupTitle": "Gardez une copie de sécurité",
    "license.lockout.data.backupDescription":
      "Enregistre une sauvegarde de toute votre boutique sur cet ordinateur. Rien n’est modifié ni supprimé.",
    "license.lockout.data.backupButton": "Créer une sauvegarde maintenant",
    "license.lockout.data.backupBusy": "Création de la sauvegarde…",
    "license.lockout.data.backupDone":
      "Sauvegarde créée et vérifiée. Elle est enregistrée sur cet ordinateur.",
    "license.lockout.data.backupDoneSize":
      "Sauvegarde créée et vérifiée ({{size}}). Elle est enregistrée sur cet ordinateur.",
    "license.lockout.data.error.signIn": "Connectez-vous d’abord, puis réessayez.",
    "license.lockout.data.error.forbidden":
      "Votre compte n’a pas le droit de faire cela. Demandez au propriétaire de la boutique.",
    "license.lockout.data.error.failed":
      "Cela n’a pas fonctionné et rien n’a été modifié. Veuillez réessayer.",
    "license.lockout.data.error.network":
      "SahelFlow est injoignable sur cet ordinateur. Veuillez réessayer.",
    "license.lockout.data.signIn": "Se connecter",
  },
  ar: {
    "license.lockout.data.title": "بياناتك ملكك",
    "license.lockout.data.description":
      "طلبياتك وزبائنك تبقى على هذا الحاسوب. حتى بدون رخصة يمكنك تنزيلها أو حفظ نسخة احتياطية.",
    "license.lockout.data.downloadTitle": "تنزيل بياناتي",
    "license.lockout.data.downloadHint": "ملف لكل قائمة. يُفتح في Excel أو Google Sheets.",
    "license.lockout.data.entity.orders": "الطلبيات",
    "license.lockout.data.entity.customers": "الزبائن",
    "license.lockout.data.entity.products": "المنتجات",
    "license.lockout.data.entity.deliveries": "التوصيلات",
    "license.lockout.data.entity.returns": "المرتجعات",
    "license.lockout.data.entity.expenses": "المصاريف",
    "license.lockout.data.preparing": "جارٍ تجهيز ملف «{{name}}»…",
    "license.lockout.data.downloaded": "ملف «{{name}}» قيد التنزيل. تحقق من التنزيلات.",
    "license.lockout.data.backupTitle": "احتفظ بنسخة آمنة",
    "license.lockout.data.backupDescription":
      "تحفظ نسخة احتياطية من متجرك كاملاً على هذا الحاسوب. لا يتغير ولا يُحذف أي شيء.",
    "license.lockout.data.backupButton": "أنشئ نسخة احتياطية الآن",
    "license.lockout.data.backupBusy": "جارٍ إنشاء النسخة الاحتياطية…",
    "license.lockout.data.backupDone": "تم إنشاء النسخة الاحتياطية والتحقق منها. هي محفوظة على هذا الحاسوب.",
    "license.lockout.data.backupDoneSize":
      "تم إنشاء النسخة الاحتياطية والتحقق منها ({{size}}). هي محفوظة على هذا الحاسوب.",
    "license.lockout.data.error.signIn": "سجّل الدخول أولاً ثم أعد المحاولة.",
    "license.lockout.data.error.forbidden": "حسابك غير مسموح له بهذا الإجراء. اطلب من صاحب المتجر.",
    "license.lockout.data.error.failed": "لم تنجح العملية ولم يتغير أي شيء. أعد المحاولة.",
    "license.lockout.data.error.network": "تعذّر الوصول إلى SahelFlow على هذا الحاسوب. أعد المحاولة.",
    "license.lockout.data.signIn": "تسجيل الدخول",
  },
};

export function getLicenseLockoutRuntimeTranslation(
  locale: Locale,
  key: string,
): string | undefined {
  return translations[locale][key];
}
