import type { Locale } from "@/lib/i18n";

const translations = {
  en: {
    title: "WhatsApp inbound recovery",
    description:
      "Messages that could not reach your inbox are kept here so you can retry them. Their content stays protected and is not shown.",
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
    retryQueued: "The message was sent back to your inbox for processing",
    retryFailed: "Could not retry this inbound message",
    history: "Recent attempt history",
    unknownContact: "Unknown contact",
  },
  fr: {
    title: "Récupération des messages WhatsApp entrants",
    description:
      "Les messages qui n’ont pas pu arriver dans votre boîte sont conservés ici pour être relancés. Leur contenu reste protégé et n’est pas affiché.",
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
    retryQueued: "Le message a été renvoyé vers votre boîte pour traitement",
    retryFailed: "Impossible de réessayer ce message entrant",
    history: "Historique récent des tentatives",
    unknownContact: "Contact inconnu",
  },
  ar: {
    title: "استرجاع رسائل واتساب الواردة",
    description:
      "تُحفظ هنا الرسائل التي تعذّر وصولها إلى صندوق الوارد لتعيد محاولتها. يبقى محتواها محميًا ولا يُعرض.",
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
    retryQueued: "أُعيدت الرسالة إلى صندوق الوارد لمعالجتها",
    retryFailed: "تعذر إعادة محاولة معالجة الرسالة الواردة",
    history: "سجل المحاولات الأخيرة",
    unknownContact: "جهة اتصال غير معروفة",
  },
} satisfies Record<Locale, Record<string, string>>;

export type WhatsAppIngressRecoveryKey = keyof (typeof translations)["en"];

export function getWhatsAppIngressRecoveryTranslation(
  locale: Locale,
  key: WhatsAppIngressRecoveryKey,
): string {
  return translations[locale][key] ?? translations.en[key];
}
