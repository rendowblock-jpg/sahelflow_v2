import type { Locale } from "@/lib/i18n";

/**
 * Runtime dictionary for the settings security-authority panel (R5-d):
 * installation/workspace identity, trusted device, signed-in sessions and
 * the PIN re-authentication gate for session revocation.
 *
 * The panel's former inline COPY dictionary (25 keys, en/fr/ar) migrated
 * here verbatim. Reused static key (NOT duplicated here): common.cancel
 * (identical value in all three locales). Keys are candidates for
 * promotion into the locale JSON bundle during the central locale pass
 * (locales/*.json are PR #355-owned).
 */
const translations: Record<Locale, Record<string, string>> = {
  en: {
    "settings.security.title": "Security & sessions",
    "settings.security.description":
      "Review the exact installation, trusted device, and signed-in sessions. Revoking a session denies access immediately.",
    "settings.security.workspace": "Workspace authority",
    "settings.security.device": "Trusted device",
    "settings.security.sessions": "Signed-in sessions",
    "settings.security.current": "Current",
    "settings.security.active": "Active",
    "settings.security.revoked": "Revoked",
    "settings.security.missing": "Database record missing",
    "settings.security.policy": "Policy version",
    "settings.security.lastSeen": "Last seen",
    "settings.security.bound": "Signed in",
    "settings.security.revoke": "Revoke session",
    "settings.security.refreshing": "Refreshing…",
    "settings.security.refresh": "Refresh",
    "settings.security.loading": "Loading security authority…",
    "settings.security.loadError": "Security authority could not be loaded.",
    "settings.security.revokeError": "The session could not be revoked.",
    "settings.security.reauthTitle": "Confirm with your PIN",
    "settings.security.reauthDescription":
      "Session administration is a high-risk action. Verify your PIN to continue.",
    "settings.security.pinPlaceholder": "Enter PIN",
    "settings.security.confirm": "Verify and revoke",
    "settings.security.incorrectPin": "The PIN could not be verified.",
    "settings.security.noSessions": "No sessions are recorded for this installation.",
  },
  fr: {
    "settings.security.title": "Sécurité et sessions",
    "settings.security.description":
      "Consultez l’installation exacte, l’appareil de confiance et les sessions connectées. La révocation bloque immédiatement l’accès.",
    "settings.security.workspace": "Autorité de l’espace de travail",
    "settings.security.device": "Appareil de confiance",
    "settings.security.sessions": "Sessions connectées",
    "settings.security.current": "Actuelle",
    "settings.security.active": "Active",
    "settings.security.revoked": "Révoquée",
    "settings.security.missing": "Enregistrement local manquant",
    "settings.security.policy": "Version de la politique",
    "settings.security.lastSeen": "Dernière activité",
    "settings.security.bound": "Connexion",
    "settings.security.revoke": "Révoquer la session",
    "settings.security.refreshing": "Actualisation…",
    "settings.security.refresh": "Actualiser",
    "settings.security.loading": "Chargement de l’autorité de sécurité…",
    "settings.security.loadError": "Impossible de charger l’autorité de sécurité.",
    "settings.security.revokeError": "Impossible de révoquer la session.",
    "settings.security.reauthTitle": "Confirmez avec votre code PIN",
    "settings.security.reauthDescription":
      "L’administration des sessions est une action sensible. Vérifiez votre PIN pour continuer.",
    "settings.security.pinPlaceholder": "Saisir le PIN",
    "settings.security.confirm": "Vérifier et révoquer",
    "settings.security.incorrectPin": "Le PIN n’a pas pu être vérifié.",
    "settings.security.noSessions": "Aucune session n’est enregistrée pour cette installation.",
  },
  ar: {
    "settings.security.title": "الأمان والجلسات",
    "settings.security.description":
      "راجع التثبيت الحالي والجهاز الموثوق والجلسات المسجّلة. إلغاء الجلسة يمنع الوصول فورًا.",
    "settings.security.workspace": "صلاحية مساحة العمل",
    "settings.security.device": "الجهاز الموثوق",
    "settings.security.sessions": "الجلسات المسجّلة",
    "settings.security.current": "الحالية",
    "settings.security.active": "نشطة",
    "settings.security.revoked": "ملغاة",
    "settings.security.missing": "سجل قاعدة البيانات مفقود",
    "settings.security.policy": "إصدار سياسة الصلاحيات",
    "settings.security.lastSeen": "آخر نشاط",
    "settings.security.bound": "تاريخ تسجيل الدخول",
    "settings.security.revoke": "إلغاء الجلسة",
    "settings.security.refreshing": "جارٍ التحديث…",
    "settings.security.refresh": "تحديث",
    "settings.security.loading": "جارٍ تحميل صلاحيات الأمان…",
    "settings.security.loadError": "تعذر تحميل صلاحيات الأمان.",
    "settings.security.revokeError": "تعذر إلغاء الجلسة.",
    "settings.security.reauthTitle": "أكد العملية بالرمز السري",
    "settings.security.reauthDescription":
      "إدارة الجلسات عملية حساسة. تحقق من الرمز السري للمتابعة.",
    "settings.security.pinPlaceholder": "أدخل الرمز السري",
    "settings.security.confirm": "تحقق ثم ألغِ الجلسة",
    "settings.security.incorrectPin": "تعذر التحقق من الرمز السري.",
    "settings.security.noSessions": "لا توجد جلسات مسجّلة لهذا التثبيت.",
  },
};

export function getSecurityRuntimeTranslation(
  locale: Locale,
  key: string,
): string | undefined {
  return translations[locale][key];
}
