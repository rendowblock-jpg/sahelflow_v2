import type { Locale } from "@/lib/i18n";

/**
 * Runtime dictionary for the checklist-driven onboarding wizard (R4-b).
 *
 * The wizard reuses the existing static `onboarding.*` keys in
 * src/lib/i18n/locales/*.json wherever they are index-free and semantically
 * exact (onboarding.connectWhatsApp(Desc), onboarding.business.name/phone/
 * wilaya, onboarding.steps.business/ai, onboarding.finish, onboarding.finishSetup,
 * onboarding.continue, onboarding.launchDashboard, onboarding.youreAllSet,
 * onboarding.dashboardReady, onboarding.complete, onboarding.saveFailed — plus
 * delivery.providersTitle/providersDesc and aiKey.* owned by the embedded
 * settings panels). Only wizard-specific copy ships here. Keys are candidates
 * for promotion into the locale JSON bundle during the central locale pass
 * (locales/*.json are PR #355-owned).
 *
 * WhatsApp pairing copy is NOT duplicated here — the wizard reuses
 * src/lib/i18n/whatsapp-pairing.ts (getWhatsAppPairingCopy) so the embedded
 * pairing step stays in copy lockstep with the inbox pairing dialog.
 */
const translations: Record<Locale, Record<string, string>> = {
  en: {
    "onboarding.checklist.title": "Setup checklist",
    "onboarding.checklist.progress": "{{done}} of {{total}} done",
    "onboarding.checklist.openStep": "Open step: {{step}}",
    "onboarding.checklist.stepDone": "{{step}} — done",
    "onboarding.shop.title": "Shop basics",
    "onboarding.shop.description":
      "Name, wilaya and phone — used on orders and delivery slips.",
    "onboarding.couriers.title": "Couriers",
    "onboarding.couriers.description":
      "Connect a delivery provider — Yalidine, Maystro, ZR Express or any EcoTrack courier — and test the connection before your first shipment.",
    "onboarding.summary.title": "What's ready",
    "onboarding.summary.skipped": "Not set up yet — you can add it anytime.",
    "onboarding.summary.openSettings": "Open settings",
    "onboarding.summary.openInbox": "Open inbox",
    "onboarding.loop.title": "How SahelFlow works",
    "onboarding.loop.subtitle":
      "Your daily loop: one WhatsApp message becomes one shipped COD order.",
    "onboarding.loop.beat1.title": "Receive the WhatsApp message",
    "onboarding.loop.beat1.body":
      "Your customer writes on WhatsApp — the message lands in your live SahelFlow inbox.",
    "onboarding.loop.beat2.title": "AI extracts the order",
    "onboarding.loop.beat2.body":
      "Customer name, phone, wilaya and items are pulled out of the chat, ready for your review.",
    "onboarding.loop.beat3.title": "Confirm & ship",
    "onboarding.loop.beat3.body":
      "One click confirms the COD order and sends the shipment to your courier.",
    "onboarding.phone.invalid":
      "Enter a valid Algerian mobile number (05, 06 or 07).",
    "onboarding.skipHint":
      "Skippable — the checklist remembers what's left; finish it anytime.",
  },
  fr: {
    "onboarding.checklist.title": "Liste de configuration",
    "onboarding.checklist.progress": "{{done}} sur {{total}} terminées",
    "onboarding.checklist.openStep": "Ouvrir l'étape : {{step}}",
    "onboarding.checklist.stepDone": "{{step}} — terminée",
    "onboarding.shop.title": "Informations de la boutique",
    "onboarding.shop.description":
      "Nom, wilaya et téléphone — utilisés sur les commandes et les bons de livraison.",
    "onboarding.couriers.title": "Transporteurs",
    "onboarding.couriers.description":
      "Connectez un transporteur — Yalidine, Maystro, ZR Express ou n'importe quel transporteur EcoTrack — et testez la connexion avant votre première expédition.",
    "onboarding.summary.title": "Ce qui est prêt",
    "onboarding.summary.skipped": "Pas encore configuré — vous pouvez l'ajouter à tout moment.",
    "onboarding.summary.openSettings": "Ouvrir les paramètres",
    "onboarding.summary.openInbox": "Ouvrir la boîte de réception",
    "onboarding.loop.title": "Comment fonctionne SahelFlow",
    "onboarding.loop.subtitle":
      "Votre boucle quotidienne : un message WhatsApp devient une commande COD expédiée.",
    "onboarding.loop.beat1.title": "Recevez le message WhatsApp",
    "onboarding.loop.beat1.body":
      "Votre client écrit sur WhatsApp — le message arrive dans votre boîte SahelFlow en direct.",
    "onboarding.loop.beat2.title": "L'IA extrait la commande",
    "onboarding.loop.beat2.body":
      "Nom du client, téléphone, wilaya et articles sont extraits de la conversation, prêts à être vérifiés.",
    "onboarding.loop.beat3.title": "Confirmez et expédiez",
    "onboarding.loop.beat3.body":
      "Un clic confirme la commande COD et envoie l'expédition à votre transporteur.",
    "onboarding.phone.invalid":
      "Saisissez un numéro de mobile algérien valide (05, 06 ou 07).",
    "onboarding.skipHint":
      "Ignorable — la liste retient ce qui reste ; terminez à tout moment.",
  },
  ar: {
    "onboarding.checklist.title": "قائمة الإعداد",
    "onboarding.checklist.progress": "اكتمل {{done}} من {{total}}",
    "onboarding.checklist.openStep": "افتح الخطوة: {{step}}",
    "onboarding.checklist.stepDone": "{{step}} — مكتملة",
    "onboarding.shop.title": "أساسيات المتجر",
    "onboarding.shop.description":
      "الاسم والولاية والهاتف — تُستخدم في الطلبيات وبون التوصيل.",
    "onboarding.couriers.title": "شركات التوصيل",
    "onboarding.couriers.description":
      "اربط شركة توصيل — Yalidine أو Maystro أو ZR Express أو أي شركة عبر EcoTrack — واختبر الاتصال قبل أول شحنة.",
    "onboarding.summary.title": "ما هو جاهز",
    "onboarding.summary.skipped": "لم يُعد بعد — يمكنك إضافته في أي وقت.",
    "onboarding.summary.openSettings": "افتح الإعدادات",
    "onboarding.summary.openInbox": "افتح صندوق الوارد",
    "onboarding.loop.title": "كيف يعمل SahelFlow",
    "onboarding.loop.subtitle":
      "حلقتك اليومية: رسالة واتساب واحدة تصبح طلبية دفع عند الاستلام مشحونة.",
    "onboarding.loop.beat1.title": "استلم رسالة واتساب",
    "onboarding.loop.beat1.body":
      "يكتب عميلك على واتساب — تصل الرسالة إلى صندوق SahelFlow المباشر.",
    "onboarding.loop.beat2.title": "الذكاء الاصطناعي يستخرج الطلب",
    "onboarding.loop.beat2.body":
      "يستخرج اسم العميل وهاتفه وولايته والمنتجات من المحادثة، جاهزة للمراجعة.",
    "onboarding.loop.beat3.title": "أكِّد واشحن",
    "onboarding.loop.beat3.body":
      "نقرة واحدة تؤكد طلبية الدفع عند الاستلام وترسل الشحنة إلى شركة التوصيل.",
    "onboarding.phone.invalid": "أدخل رقم هاتف جزائري صالح (05 أو 06 أو 07).",
    "onboarding.skipHint":
      "قابلة للتخطي — تتذكر القائمة ما تبقى؛ أكملها في أي وقت.",
  },
};

export function getOnboardingRuntimeTranslation(
  locale: Locale,
  key: string,
): string | undefined {
  return translations[locale][key];
}
