import type { Locale } from "@/lib/i18n";

/**
 * Runtime copy for the backup an update makes first. {{minutes}} is the age of
 * the backup that made a new one unnecessary.
 */
const translations: Record<Locale, Record<string, string>> = {
  en: {
    "updater.backup.running": "Backing up your shop first",
    "updater.backup.chipRunning": "Backing up…",
    "updater.backup.done": "Backup done. Installing the update.",
    "updater.backup.skipped": "A backup from {{minutes}} min ago is recent enough. Installing the update.",
    "updater.backup.failed": "Backup failed. Updating anyway, your data is not touched by the update.",
    "updater.backup.timedOut": "The backup is taking too long. Updating anyway, your data is not touched by the update.",
  },
  fr: {
    "updater.backup.running": "Sauvegarde de votre boutique avant la mise à jour",
    "updater.backup.chipRunning": "Sauvegarde…",
    "updater.backup.done": "Sauvegarde terminée. Installation de la mise à jour.",
    "updater.backup.skipped": "Une sauvegarde d’il y a {{minutes}} min est assez récente. Installation de la mise à jour.",
    "updater.backup.failed": "Échec de la sauvegarde. Mise à jour quand même : vos données ne sont pas touchées par la mise à jour.",
    "updater.backup.timedOut": "La sauvegarde prend trop de temps. Mise à jour quand même : vos données ne sont pas touchées par la mise à jour.",
  },
  ar: {
    "updater.backup.running": "جارٍ حفظ نسخة احتياطية من متجرك أولاً",
    "updater.backup.chipRunning": "جارٍ النسخ الاحتياطي…",
    "updater.backup.done": "تم حفظ النسخة الاحتياطية. جارٍ تثبيت التحديث.",
    "updater.backup.skipped": "توجد نسخة احتياطية حديثة (قبل {{minutes}} د). جارٍ تثبيت التحديث.",
    "updater.backup.failed": "تعذّر حفظ النسخة الاحتياطية. سيتم التحديث على أي حال، فالتحديث لا يمسّ بياناتك.",
    "updater.backup.timedOut": "استغرق حفظ النسخة الاحتياطية وقتًا طويلًا. سيتم التحديث على أي حال، فالتحديث لا يمسّ بياناتك.",
  },
};

export function getPreUpdateBackupRuntimeTranslation(locale: Locale, key: string): string | undefined {
  return translations[locale][key];
}
