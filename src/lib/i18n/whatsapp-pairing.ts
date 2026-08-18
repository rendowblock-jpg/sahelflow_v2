import type { Locale } from "@/lib/i18n";

const PAIRING_COPY = {
  en: {
    eyebrow: "WhatsApp connection",
    title: "Connect your business WhatsApp",
    description:
      "SahelFlow keeps saved conversations available while the secure local WhatsApp service prepares your session.",
    startingTitle: "Starting the secure WhatsApp service",
    startingBody: "This normally takes a few seconds.",
    waitingQrTitle: "Preparing a fresh QR code",
    waitingQrBody: "Keep this window open while SahelFlow requests a new linked-device session.",
    scanTitle: "Scan with WhatsApp",
    scanBody: "On your phone: WhatsApp → Settings → Linked devices → Link a device.",
    waitingPhone: "Waiting for your phone…",
    connectedTitle: "WhatsApp connected",
    connectedBody: "The live inbox can now synchronize and send replies.",
    unavailableTitle: "WhatsApp service is unavailable",
    unavailableBody:
      "SahelFlow could not reach its protected local WhatsApp service. Your saved inbox is still safe and readable.",
    disconnectedTitle: "WhatsApp did not start",
    disconnectedBody: "Retry the connection. If it fails again, SahelFlow will keep the saved inbox available.",
    qrFailedTitle: "The QR code could not be displayed",
    qrFailedBody: "Request the current QR again. No saved conversation data is affected.",
    retry: "Retry connection",
    refreshQr: "Refresh QR",
    qrAlt: "WhatsApp linked-device QR code",
    secureNote: "Pairing stays local to this SahelFlow installation.",
  },
  fr: {
    eyebrow: "Connexion WhatsApp",
    title: "Connectez votre WhatsApp professionnel",
    description:
      "SahelFlow conserve les conversations enregistrées pendant que le service WhatsApp local sécurisé prépare votre session.",
    startingTitle: "Démarrage du service WhatsApp sécurisé",
    startingBody: "Cela prend normalement quelques secondes.",
    waitingQrTitle: "Préparation d’un nouveau QR code",
    waitingQrBody: "Gardez cette fenêtre ouverte pendant la création d’une session d’appareil lié.",
    scanTitle: "Scannez avec WhatsApp",
    scanBody: "Sur votre téléphone : WhatsApp → Paramètres → Appareils connectés → Connecter un appareil.",
    waitingPhone: "En attente de votre téléphone…",
    connectedTitle: "WhatsApp est connecté",
    connectedBody: "La boîte en direct peut maintenant se synchroniser et envoyer des réponses.",
    unavailableTitle: "Le service WhatsApp est indisponible",
    unavailableBody:
      "SahelFlow ne peut pas joindre son service WhatsApp local protégé. Votre boîte enregistrée reste sûre et lisible.",
    disconnectedTitle: "WhatsApp n’a pas démarré",
    disconnectedBody: "Relancez la connexion. La boîte enregistrée reste disponible même en cas d’échec.",
    qrFailedTitle: "Le QR code ne peut pas être affiché",
    qrFailedBody: "Demandez à nouveau le QR actuel. Aucune conversation enregistrée n’est affectée.",
    retry: "Réessayer la connexion",
    refreshQr: "Actualiser le QR",
    qrAlt: "QR code WhatsApp pour appareil connecté",
    secureNote: "L’association reste locale à cette installation SahelFlow.",
  },
  ar: {
    eyebrow: "اتصال واتساب",
    title: "اربط واتساب العمل",
    description:
      "يبقي SahelFlow المحادثات المحفوظة متاحة بينما تجهّز خدمة واتساب المحلية الآمنة جلسة الربط.",
    startingTitle: "جارٍ تشغيل خدمة واتساب الآمنة",
    startingBody: "يستغرق ذلك عادة بضع ثوانٍ.",
    waitingQrTitle: "جارٍ تجهيز رمز QR جديد",
    waitingQrBody: "أبقِ هذه النافذة مفتوحة بينما ينشئ SahelFlow جلسة جهاز مرتبط جديدة.",
    scanTitle: "امسح الرمز من واتساب",
    scanBody: "على هاتفك: واتساب ← الإعدادات ← الأجهزة المرتبطة ← ربط جهاز.",
    waitingPhone: "في انتظار هاتفك…",
    connectedTitle: "تم ربط واتساب",
    connectedBody: "يمكن الآن مزامنة صندوق الوارد المباشر وإرسال الردود.",
    unavailableTitle: "خدمة واتساب غير متاحة",
    unavailableBody:
      "تعذّر على SahelFlow الوصول إلى خدمة واتساب المحلية المحمية. يبقى صندوق الوارد المحفوظ آمنًا وقابلًا للقراءة.",
    disconnectedTitle: "لم يبدأ واتساب",
    disconnectedBody: "أعد محاولة الاتصال. سيبقى صندوق الوارد المحفوظ متاحًا إذا فشلت المحاولة.",
    qrFailedTitle: "تعذّر عرض رمز QR",
    qrFailedBody: "اطلب رمز QR الحالي مرة أخرى. لن تتأثر أي محادثة محفوظة.",
    retry: "إعادة محاولة الاتصال",
    refreshQr: "تحديث رمز QR",
    qrAlt: "رمز QR لربط واتساب بجهاز",
    secureNote: "يبقى الربط محليًا داخل تثبيت SahelFlow هذا.",
  },
} as const;

export type WhatsAppPairingCopyKey = keyof (typeof PAIRING_COPY)["en"];

export function getWhatsAppPairingCopy(
  locale: Locale,
  key: WhatsAppPairingCopyKey,
): string {
  return PAIRING_COPY[locale][key];
}
