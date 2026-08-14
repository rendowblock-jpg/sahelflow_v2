import type { Locale } from "@/lib/i18n";
import { getAutomationRuntimeTranslation } from "@/lib/i18n/automation-runtime";
import { getCommerceRuntimeTranslation } from "@/lib/i18n/commerce-runtime";
import { getOrdersWorkspaceTranslation } from "@/lib/i18n/orders-workspace";
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
    "nav.storefrontBuilder": "Storefront Builder",
    "topbar.defaultShopName": "My store",
    "onboarding.businessNameExample": "My Shop",
    "onboarding.wilayaExample": "Algiers",
    "onboarding.productNameExample": "Test Product",
    "products.nameExample": "Organic cotton T-shirt",
    "storefront.addressExample": "Algiers, Algeria",
    "settings.appearance.colorStyle": "Color style",
    "settings.appearance.colorStyleHint": "Choose one coordinated accent family. Status and business meaning colors stay semantic.",
    "settings.appearance.densityHintGlobal": "Adjusts workspace spacing and control density across SahelFlow.",
    "settings.appearance.preset.sahel": "Sahel",
    "settings.appearance.preset.atlas": "Atlas",
    "settings.appearance.preset.oasis": "Oasis",
    "settings.appearance.preset.dune": "Dune",
    "settings.appearance.navigationTitle": "Navigation order",
    "settings.appearance.navigationHint": "Arrange the main work areas to match how you run your day. Child workflows stay attached to their parent area.",
    "settings.appearance.navigationReset": "Reset order",
    "settings.appearance.navigationMoveUp": "Move {{name}} up",
    "settings.appearance.navigationMoveDown": "Move {{name}} down",
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
    "nav.storefrontBuilder": "Créateur de boutique",
    "topbar.defaultShopName": "Ma boutique",
    "onboarding.businessNameExample": "Ma boutique",
    "onboarding.wilayaExample": "Alger",
    "onboarding.productNameExample": "Produit test",
    "products.nameExample": "T-shirt en coton bio",
    "storefront.addressExample": "Alger, Algérie",
    "settings.appearance.colorStyle": "Style de couleur",
    "settings.appearance.colorStyleHint": "Choisissez une famille d’accent coordonnée. Les couleurs d’état et de sens métier restent sémantiques.",
    "settings.appearance.densityHintGlobal": "Ajuste l’espacement des espaces de travail et la densité des contrôles dans SahelFlow.",
    "settings.appearance.preset.sahel": "Sahel",
    "settings.appearance.preset.atlas": "Atlas",
    "settings.appearance.preset.oasis": "Oasis",
    "settings.appearance.preset.dune": "Dune",
    "settings.appearance.navigationTitle": "Ordre de navigation",
    "settings.appearance.navigationHint": "Organisez les espaces de travail principaux selon votre journée. Les sous-flux restent attachés à leur espace parent.",
    "settings.appearance.navigationReset": "Réinitialiser l’ordre",
    "settings.appearance.navigationMoveUp": "Monter {{name}}",
    "settings.appearance.navigationMoveDown": "Descendre {{name}}",
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
    "nav.storefrontBuilder": "منشئ المتجر",
    "topbar.defaultShopName": "متجري",
    "onboarding.businessNameExample": "متجري",
    "onboarding.wilayaExample": "الجزائر",
    "onboarding.productNameExample": "منتج تجريبي",
    "products.nameExample": "قميص قطني عضوي",
    "storefront.addressExample": "الجزائر، الجزائر",
    "settings.appearance.colorStyle": "نمط الألوان",
    "settings.appearance.colorStyleHint": "اختر عائلة ألوان متناسقة. تبقى ألوان الحالات والمعاني التجارية دلالية وثابتة.",
    "settings.appearance.densityHintGlobal": "يضبط تباعد مساحات العمل وكثافة عناصر التحكم في SahelFlow.",
    "settings.appearance.preset.sahel": "الساحل",
    "settings.appearance.preset.atlas": "الأطلس",
    "settings.appearance.preset.oasis": "الواحة",
    "settings.appearance.preset.dune": "الكثبان",
    "settings.appearance.navigationTitle": "ترتيب التنقل",
    "settings.appearance.navigationHint": "رتّب مساحات العمل الرئيسية بما يناسب يومك. تبقى المسارات الفرعية مرتبطة بمساحتها الرئيسية.",
    "settings.appearance.navigationReset": "إعادة الترتيب الافتراضي",
    "settings.appearance.navigationMoveUp": "نقل {{name}} للأعلى",
    "settings.appearance.navigationMoveDown": "نقل {{name}} للأسفل",
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
    getOrdersWorkspaceTranslation(locale, key) ??
    getPhase5RuntimeTranslation(locale, key) ??
    getWhatsAppRecoveryTranslation(locale, key)
  );
}
