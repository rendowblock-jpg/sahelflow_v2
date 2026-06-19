-- Seed default WhatsApp templates for new sellers
-- Run manually after creating a seller to populate default templates
-- Variables: {{customer_name}}, {{order_number}}, {{wilaya}}, {{product_name}}, {{business_name}}
--
-- M3 fix: Previously Arabic-only. Now includes trilingual defaults (ar/fr/en).
-- Arabic templates keep their original slugs (welcome, followup, etc.).
-- French and English templates use language-suffixed slugs (welcome_fr, welcome_en)
-- to avoid conflicts with the UNIQUE(seller_id, slug) constraint.

-- ═══════════════════════════════════════════════════════════════
-- Arabic templates (original — slug has no suffix)
-- ═══════════════════════════════════════════════════════════════

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

-- ═══════════════════════════════════════════════════════════════
-- French templates (M3 fix — slug suffixed with _fr)
-- ═══════════════════════════════════════════════════════════════

INSERT INTO whatsapp_templates (seller_id, name, slug, content, category, language)
SELECT
  id,
  'Message de bienvenue',
  'welcome_fr',
  'Bonjour {{customer_name}}! 🎉 Merci de votre intérêt pour {{business_name}}. Comment pouvons-nous vous aider aujourd''hui?',
  'welcome',
  'fr'
FROM sellers
WHERE NOT EXISTS (
  SELECT 1 FROM whatsapp_templates wt WHERE wt.seller_id = sellers.id AND wt.slug = 'welcome_fr'
);

INSERT INTO whatsapp_templates (seller_id, name, slug, content, category, language)
SELECT
  id,
  'Suivi post-livraison',
  'followup_fr',
  'Bonjour {{customer_name}}! J''espère que le produit vous plaît 🙏 Si vous avez des questions, n''hésitez pas. - {{business_name}}',
  'followup',
  'fr'
FROM sellers
WHERE NOT EXISTS (
  SELECT 1 FROM whatsapp_templates wt WHERE wt.seller_id = sellers.id AND wt.slug = 'followup_fr'
);

INSERT INTO whatsapp_templates (seller_id, name, slug, content, category, language)
SELECT
  id,
  'Confirmation de commande',
  'confirmation_fr',
  'Bonjour {{customer_name}}! Votre commande n°{{order_number}} est confirmée ✅ Livraison à {{wilaya}}. Merci pour votre confiance! - {{business_name}}',
  'confirmation',
  'fr'
FROM sellers
WHERE NOT EXISTS (
  SELECT 1 FROM whatsapp_templates wt WHERE wt.seller_id = sellers.id AND wt.slug = 'confirmation_fr'
);

INSERT INTO whatsapp_templates (seller_id, name, slug, content, category, language)
SELECT
  id,
  'Offre de vente additionnelle',
  'upsell_fr',
  '{{customer_name}}, nous avons une offre spéciale sur {{product_name}}! 🔥 Vous pouvez l''ajouter à votre commande avec une remise. Qu''en dites-vous? - {{business_name}}',
  'upsell',
  'fr'
FROM sellers
WHERE NOT EXISTS (
  SELECT 1 FROM whatsapp_templates wt WHERE wt.seller_id = sellers.id AND wt.slug = 'upsell_fr'
);

-- ═══════════════════════════════════════════════════════════════
-- English templates (M3 fix — slug suffixed with _en)
-- ═══════════════════════════════════════════════════════════════

INSERT INTO whatsapp_templates (seller_id, name, slug, content, category, language)
SELECT
  id,
  'Welcome Message',
  'welcome_en',
  'Hello {{customer_name}}! 🎉 Thank you for reaching out to {{business_name}}. How can we help you today?',
  'welcome',
  'en'
FROM sellers
WHERE NOT EXISTS (
  SELECT 1 FROM whatsapp_templates wt WHERE wt.seller_id = sellers.id AND wt.slug = 'welcome_en'
);

INSERT INTO whatsapp_templates (seller_id, name, slug, content, category, language)
SELECT
  id,
  'Post-Delivery Follow-up',
  'followup_en',
  'Hi {{customer_name}}! Hope you''re doing well. We hope you like the product 🙏 If you have any questions, we''re here for you. - {{business_name}}',
  'followup',
  'en'
FROM sellers
WHERE NOT EXISTS (
  SELECT 1 FROM whatsapp_templates wt WHERE wt.seller_id = sellers.id AND wt.slug = 'followup_en'
);

INSERT INTO whatsapp_templates (seller_id, name, slug, content, category, language)
SELECT
  id,
  'Order Confirmation',
  'confirmation_en',
  'Hello {{customer_name}}! Your order #{{order_number}} is confirmed ✅ Delivery to {{wilaya}}. Thank you for your trust! - {{business_name}}',
  'confirmation',
  'en'
FROM sellers
WHERE NOT EXISTS (
  SELECT 1 FROM whatsapp_templates wt WHERE wt.seller_id = sellers.id AND wt.slug = 'confirmation_en'
);

INSERT INTO whatsapp_templates (seller_id, name, slug, content, category, language)
SELECT
  id,
  'Upsell Offer',
  'upsell_en',
  '{{customer_name}}, we have a special offer on {{product_name}}! 🔥 You can add it to your order with a discount. What do you think? - {{business_name}}',
  'upsell',
  'en'
FROM sellers
WHERE NOT EXISTS (
  SELECT 1 FROM whatsapp_templates wt WHERE wt.seller_id = sellers.id AND wt.slug = 'upsell_en'
);
