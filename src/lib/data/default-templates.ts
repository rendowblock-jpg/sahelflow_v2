/**
 * Default WhatsApp templates inserted for each new seller during onboarding.
 *
 * H3 fix: Previously hardcoded inline in auth-service.ts. Now extracted to a
 * shared module so there's a single source of truth. The SQL seed file
 * (supabase/migrations/seeds/whatsapp_templates.sql) mirrors these for
 * manual/initial seeding.
 *
 * Template variables: {{customer_name}}, {{order_number}}, {{wilaya}},
 * {{product_name}}, {{business_name}}
 */

export interface DefaultTemplate {
  name: string;
  slug: string;
  content: string;
  category: "welcome" | "followup" | "confirmation" | "upsell" | "general";
  language: "ar" | "fr" | "en";
}

export const DEFAULT_WHATSAPP_TEMPLATES: DefaultTemplate[] = [
  {
    name: "Welcome Message",
    slug: "welcome",
    content:
      "مرحبا {{customer_name}}! 🎉 شكرا على التواصل مع {{business_name}}. كيف نقدر نعاونك اليوم؟",
    category: "welcome",
    language: "ar",
  },
  {
    name: "Post-Delivery Follow-up",
    slug: "followup",
    content:
      "سلام {{customer_name}}! واش راك؟ نتمنى المنتوج عجبك 🙏 إذا عندك أي سؤال ولا حاجة، نحنا هنا. - {{business_name}}",
    category: "followup",
    language: "ar",
  },
  {
    name: "Order Confirmation",
    slug: "confirmation",
    content:
      "مرحبا {{customer_name}}! طلبك رقم {{order_number}} تأكد ✅ التوصيل لـ {{wilaya}}. شكرا على الثقة! - {{business_name}}",
    category: "confirmation",
    language: "ar",
  },
  {
    name: "Upsell Offer",
    slug: "upsell",
    content:
      "{{customer_name}}، عندنا عرض خاص على {{product_name}}! 🔥 تقدر تزيدو لطلبك بخصم. واش رايك؟ - {{business_name}}",
    category: "upsell",
    language: "ar",
  },
];
