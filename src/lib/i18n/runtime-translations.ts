import type { Locale } from "@/lib/i18n";
import { getAutomationRuntimeTranslation } from "@/lib/i18n/automation-runtime";
import { getCommerceRuntimeTranslation } from "@/lib/i18n/commerce-runtime";
import { getPhase5RuntimeTranslation } from "@/lib/i18n/phase5-runtime";
import { getWhatsAppRecoveryTranslation } from "@/lib/i18n/whatsapp-recovery";

const SHARED_RUNTIME_COPY = {
  en: {
    "common.timeline": "Timeline",
    "common.loading": "Loading",
    "common.breadcrumb": "Breadcrumb",
    "common.backToConversations": "Back to conversations",
    "common.stock": "stock",
    "ai.chatMessages": "AI chat messages",
    "charts.areaTrend": "Area trend chart",
    "charts.composedTrend": "Composed trend chart",
    "charts.donut": "Donut chart",
    "charts.horizontalBar": "Horizontal bar chart",
    "charts.lineTrend": "Line trend chart",
    "charts.radialGauge": "Radial gauge",
    "inbox.subtitle": "Customer conversations and WhatsApp messaging",
    "onboarding.businessNameExample": "My Shop",
    "onboarding.wilayaExample": "Algiers",
    "onboarding.productNameExample": "Test Product",
    "products.nameExample": "Organic cotton T-shirt",
    "storefront.addressExample": "Algiers, Algeria",
  },
  fr: {
    "common.timeline": "Chronologie",
    "common.loading": "Chargement",
    "common.breadcrumb": "Fil d’Ariane",
    "common.backToConversations": "Retour aux conversations",
    "common.stock": "stock",
    "ai.chatMessages": "Messages de discussion IA",
    "charts.areaTrend": "Graphique de tendance en aires",
    "charts.composedTrend": "Graphique de tendance combiné",
    "charts.donut": "Graphique en anneau",
    "charts.horizontalBar": "Graphique à barres horizontales",
    "charts.lineTrend": "Graphique de tendance linéaire",
    "charts.radialGauge": "Jauge radiale",
    "inbox.subtitle": "Conversations clients et messagerie WhatsApp",
    "onboarding.businessNameExample": "Ma boutique",
    "onboarding.wilayaExample": "Alger",
    "onboarding.productNameExample": "Produit test",
    "products.nameExample": "T-shirt en coton bio",
    "storefront.addressExample": "Alger, Algérie",
  },
  ar: {
    "common.timeline": "الخط الزمني",
    "common.loading": "جارٍ التحميل",
    "common.breadcrumb": "مسار التنقل",
    "common.backToConversations": "العودة إلى المحادثات",
    "common.stock": "المخزون",
    "ai.chatMessages": "رسائل محادثة الذكاء الاصطناعي",
    "charts.areaTrend": "مخطط اتجاه مساحي",
    "charts.composedTrend": "مخطط اتجاه مركب",
    "charts.donut": "مخطط حلقي",
    "charts.horizontalBar": "مخطط أعمدة أفقي",
    "charts.lineTrend": "مخطط اتجاه خطي",
    "charts.radialGauge": "مقياس شعاعي",
    "inbox.subtitle": "محادثات العملاء والمراسلة عبر واتساب",
    "onboarding.businessNameExample": "متجري",
    "onboarding.wilayaExample": "الجزائر",
    "onboarding.productNameExample": "منتج تجريبي",
    "products.nameExample": "قميص قطني عضوي",
    "storefront.addressExample": "الجزائر، الجزائر",
  },
} as const satisfies Record<Locale, Record<string, string>>;

/**
 * Shared fallback translation authority for copy that is generated or owned by
 * runtime subsystems rather than the static locale JSON bundle.
 *
 * Both server and client translators must call this resolver so a key cannot be
 * translated in a hydrated client while leaking its dotted identifier from a
 * Server Component render.
 */
export function getRuntimeTranslation(
  locale: Locale,
  key: string,
): string | undefined {
  return (
    (SHARED_RUNTIME_COPY[locale] as Readonly<Record<string, string>>)[key] ??
    getAutomationRuntimeTranslation(locale, key) ??
    getCommerceRuntimeTranslation(locale, key) ??
    getPhase5RuntimeTranslation(locale, key) ??
    getWhatsAppRecoveryTranslation(locale, key)
  );
}
