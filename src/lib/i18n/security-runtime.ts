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
    "settings.changePin.title": "Owner PIN",
    "settings.changePin.description":
      "Your PIN encrypts this shop's data on this machine. Changing it signs every other session out.",
    "settings.changePin.current": "Current PIN",
    "settings.changePin.next": "New PIN",
    "settings.changePin.confirm": "Confirm new PIN",
    "settings.changePin.submit": "Change PIN",
    "settings.changePin.submitting": "Changing PIN…",
    "settings.changePin.changed": "PIN changed. Other sessions were signed out.",
    "settings.changePin.mismatch": "The new PINs do not match.",
    "settings.changePin.tooShort": "The new PIN must be at least 8 characters.",
    "settings.changePin.same": "The new PIN must be different from the current one.",
    "settings.changePin.failed": "The PIN could not be changed.",
    "settings.changePin.ownerOnly": "Only the shop owner can change the owner PIN.",
    "settings.changePin.irrecoverable":
      "There is no recovery if you forget it. Store the new PIN safely before continuing.",
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
    "settings.changePin.title": "Code PIN du propriétaire",
    "settings.changePin.description":
      "Votre code PIN chiffre les données de cette boutique sur cette machine. Le modifier déconnecte toutes les autres sessions.",
    "settings.changePin.current": "Code PIN actuel",
    "settings.changePin.next": "Nouveau code PIN",
    "settings.changePin.confirm": "Confirmer le nouveau code PIN",
    "settings.changePin.submit": "Modifier le code PIN",
    "settings.changePin.submitting": "Modification du code PIN…",
    "settings.changePin.changed":
      "Code PIN modifié. Les autres sessions ont été déconnectées.",
    "settings.changePin.mismatch": "Les nouveaux codes PIN ne correspondent pas.",
    "settings.changePin.tooShort":
      "Le nouveau code PIN doit contenir au moins 8 caractères.",
    "settings.changePin.same":
      "Le nouveau code PIN doit être différent de l’actuel.",
    "settings.changePin.failed": "Le code PIN n’a pas pu être modifié.",
    "settings.changePin.ownerOnly":
      "Seul le propriétaire de la boutique peut modifier son code PIN.",
    "settings.changePin.irrecoverable":
      "Aucune récupération n’est possible en cas d’oubli. Conservez le nouveau code PIN en lieu sûr avant de continuer.",
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
    "settings.changePin.title": "الرمز السري للمالك",
    "settings.changePin.description":
      "يشفّر رمزك السري بيانات هذا المتجر على هذا الجهاز. تغييره يسجّل خروج كل الجلسات الأخرى.",
    "settings.changePin.current": "الرمز السري الحالي",
    "settings.changePin.next": "الرمز السري الجديد",
    "settings.changePin.confirm": "تأكيد الرمز السري الجديد",
    "settings.changePin.submit": "تغيير الرمز السري",
    "settings.changePin.submitting": "جارٍ تغيير الرمز السري…",
    "settings.changePin.changed":
      "تم تغيير الرمز السري. وسُجّل خروج الجلسات الأخرى.",
    "settings.changePin.mismatch": "الرمزان الجديدان غير متطابقين.",
    "settings.changePin.tooShort":
      "يجب ألا يقل الرمز السري الجديد عن 8 محارف.",
    "settings.changePin.same":
      "يجب أن يختلف الرمز السري الجديد عن الحالي.",
    "settings.changePin.failed": "تعذر تغيير الرمز السري.",
    "settings.changePin.ownerOnly":
      "يمكن لمالك المتجر وحده تغيير الرمز السري للمالك.",
    "settings.changePin.irrecoverable":
      "لا توجد وسيلة للاسترجاع إذا نسيته. احفظ الرمز السري الجديد في مكان آمن قبل المتابعة.",
  },
};

export function getSecurityRuntimeTranslation(
  locale: Locale,
  key: string,
): string | undefined {
  return translations[locale][key];
}
