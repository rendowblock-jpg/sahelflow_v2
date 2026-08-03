import type { Locale } from "@/lib/i18n";

const translations: Record<Locale, Record<string, string>> = {
  en: {
    title: "WhatsApp inbound recovery",
    description:
      "Messages that could not enter the durable inbox remain tracked here. Raw message evidence is protected and is not displayed.",
    retrying: "Retrying",
    quarantined: "Quarantined",
    dead_letter: "Dead letter",
    processing: "Processing",
    received: "Received",
    applied: "Applied",
    attempts: "Attempts",
    lastError: "Last error",
    retryReason: "Reason for retry",
    retryPlaceholder: "Describe why this message is safe to retry",
    retry: "Retry",
    retryingAction: "Retrying…",
    refresh: "Refresh",
    noIssues: "No inbound recovery issues",
    retrySucceeded: "Inbound message recovery completed",
    retryQueued: "Inbound message was returned to durable processing",
    retryFailed: "Could not retry this inbound message",
    history: "Recent attempt history",
    unknownContact: "Unknown contact",
  },
  fr: {
    title: "Récupération des messages WhatsApp entrants",
    description:
      "Les messages qui n’ont pas pu entrer dans la boîte durable restent suivis ici. Les preuves brutes sont protégées et ne sont pas affichées.",
    retrying: "Nouvelle tentative",
    quarantined: "En quarantaine",
    dead_letter: "Échec définitif",
    processing: "Traitement",
    received: "Reçu",
    applied: "Appliqué",
    attempts: "Tentatives",
    lastError: "Dernière erreur",
    retryReason: "Motif de la nouvelle tentative",
    retryPlaceholder: "Expliquez pourquoi ce message peut être réessayé",
    retry: "Réessayer",
    retryingAction: "Nouvelle tentative…",
    refresh: "Actualiser",
    noIssues: "Aucun problème de récupération entrant",
    retrySucceeded: "La récupération du message entrant est terminée",
    retryQueued: "Le message entrant a été replacé dans le traitement durable",
    retryFailed: "Impossible de réessayer ce message entrant",
    history: "Historique récent des tentatives",
    unknownContact: "Contact inconnu",
  },
  ar: {
    title: "استرجاع رسائل واتساب الواردة",
    description:
      "تبقى الرسائل التي تعذر إدخالها إلى صندوق الوارد الدائم مسجلة هنا. بيانات الرسالة الأصلية محمية ولا يتم عرضها.",
    retrying: "إعادة المحاولة",
    quarantined: "في الحجر",
    dead_letter: "فشل نهائي",
    processing: "قيد المعالجة",
    received: "مستلمة",
    applied: "مطبقة",
    attempts: "المحاولات",
    lastError: "آخر خطأ",
    retryReason: "سبب إعادة المحاولة",
    retryPlaceholder: "اشرح لماذا يمكن إعادة معالجة هذه الرسالة بأمان",
    retry: "إعادة المحاولة",
    retryingAction: "جارٍ إعادة المحاولة…",
    refresh: "تحديث",
    noIssues: "لا توجد مشاكل في استرجاع الرسائل الواردة",
    retrySucceeded: "اكتمل استرجاع الرسالة الواردة",
    retryQueued: "أُعيدت الرسالة الواردة إلى المعالجة الدائمة",
    retryFailed: "تعذر إعادة محاولة معالجة الرسالة الواردة",
    history: "سجل المحاولات الأخيرة",
    unknownContact: "جهة اتصال غير معروفة",
  },
};

export type WhatsAppIngressRecoveryKey = keyof (typeof translations)["en"];

export function getWhatsAppIngressRecoveryTranslation(
  locale: Locale,
  key: WhatsAppIngressRecoveryKey,
): string {
  return translations[locale][key] ?? translations.en[key];
}
