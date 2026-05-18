-- Seed default WhatsApp templates for new sellers
-- Run manually after creating a seller to populate default templates
-- Variables: {{customer_name}}, {{order_number}}, {{wilaya}}, {{product_name}}, {{business_name}}

INSERT INTO whatsapp_templates (seller_id, name, slug, content, category, language)
SELECT
  id,
  'Welcome Message',
  'welcome',
  'مرحبا {{customer_name}}! 🎉 شكرا على التواصل مع {{business_name}}. كيف نقدر نعاونك اليوم؟',
  'welcome',
  'ar'
FROM sellers
WHERE NOT EXISTS (
  SELECT 1 FROM whatsapp_templates wt WHERE wt.seller_id = sellers.id AND wt.slug = 'welcome'
);

INSERT INTO whatsapp_templates (seller_id, name, slug, content, category, language)
SELECT
  id,
  'Post-Delivery Follow-up',
  'followup',
  'سلام {{customer_name}}! واش راك؟ نتمنى المنتوج عجبك 🙏 إذا عندك أي سؤال ولا حاجة، نحنا هنا. - {{business_name}}',
  'followup',
  'ar'
FROM sellers
WHERE NOT EXISTS (
  SELECT 1 FROM whatsapp_templates wt WHERE wt.seller_id = sellers.id AND wt.slug = 'followup'
);

INSERT INTO whatsapp_templates (seller_id, name, slug, content, category, language)
SELECT
  id,
  'Order Confirmation',
  'confirmation',
  'مرحبا {{customer_name}}! طلبك رقم {{order_number}} تأكد ✅ التوصيل لـ {{wilaya}}. شكرا على الثقة! - {{business_name}}',
  'confirmation',
  'ar'
FROM sellers
WHERE NOT EXISTS (
  SELECT 1 FROM whatsapp_templates wt WHERE wt.seller_id = sellers.id AND wt.slug = 'confirmation'
);

INSERT INTO whatsapp_templates (seller_id, name, slug, content, category, language)
SELECT
  id,
  'Upsell Offer',
  'upsell',
  '{{customer_name}}، عندنا عرض خاص على {{product_name}}! 🔥 تقدر تزيدو لطلبك بخصم. واش رايك؟ - {{business_name}}',
  'upsell',
  'ar'
FROM sellers
WHERE NOT EXISTS (
  SELECT 1 FROM whatsapp_templates wt WHERE wt.seller_id = sellers.id AND wt.slug = 'upsell'
);
