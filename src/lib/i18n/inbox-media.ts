import type { Locale } from "@/lib/i18n";

const COPY = {
  en: {
    loading: "Saving media securely…",
    ready: "Saved locally and verified before opening.",
    failed: "This media could not be saved. The message remains in your history.",
    download: "Download",
    openDocument: "Download document",
    downloading: "Preparing secure download…",
    downloadFailed: "This media could not be opened or downloaded. Your Inbox stayed unchanged.",
    previewUnavailable: "Preview unavailable",
  },
  fr: {
    loading: "Enregistrement sécurisé du média…",
    ready: "Enregistré localement et vérifié avant l’ouverture.",
    failed: "Ce média n’a pas pu être enregistré. Le message reste dans votre historique.",
    download: "Télécharger",
    openDocument: "Télécharger le document",
    downloading: "Préparation du téléchargement sécurisé…",
    downloadFailed: "Impossible d’ouvrir ou de télécharger ce média. Votre boîte de réception reste inchangée.",
    previewUnavailable: "Aperçu indisponible",
  },
  ar: {
    loading: "جارٍ حفظ الوسائط بشكل آمن…",
    ready: "محفوظة محليًا وتم التحقق منها قبل الفتح.",
    failed: "تعذّر حفظ هذه الوسائط. تبقى الرسالة محفوظة في السجل.",
    download: "تنزيل",
    openDocument: "تنزيل المستند",
    downloading: "جارٍ تجهيز التنزيل الآمن…",
    downloadFailed: "تعذّر فتح هذه الوسائط أو تنزيلها. بقي صندوق الوارد دون تغيير.",
    previewUnavailable: "المعاينة غير متاحة",
  },
} as const;

export type InboxMediaCopyKey = keyof (typeof COPY)["en"];

export function getInboxMediaCopy(locale: Locale, key: InboxMediaCopyKey): string {
  return COPY[locale]?.[key] ?? COPY.en[key];
}
