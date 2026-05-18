-- WhatsApp template messages for automated messaging
-- Sellers can create, edit, and manage reusable message templates
-- Templates support variable placeholders: {{customer_name}}, {{order_number}}, {{wilaya}}, {{product_name}}

CREATE TABLE IF NOT EXISTS whatsapp_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  language TEXT NOT NULL DEFAULT 'ar',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(seller_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_seller
  ON whatsapp_templates (seller_id, category);

COMMENT ON TABLE whatsapp_templates IS
  'Reusable WhatsApp message templates with variable interpolation for automated messaging';
COMMENT ON COLUMN whatsapp_templates.slug IS
  'Unique identifier for the template within a seller scope. Used by automation recipes (e.g., "welcome", "followup")';
COMMENT ON COLUMN whatsapp_templates.content IS
  'Template body with {{variable}} placeholders: {{customer_name}}, {{order_number}}, {{wilaya}}, {{product_name}}, {{store_name}}';
COMMENT ON COLUMN whatsapp_templates.category IS
  'Template category: welcome, followup, confirmation, upsell, general';
COMMENT ON COLUMN whatsapp_templates.language IS
  'Primary language of the template content: ar (Darija), fr, en';

-- Seed default templates for existing sellers
INSERT INTO whatsapp_templates (seller_id, name, slug, content, category, language)
SELECT
  id,
  'Welcome Message',
  'welcome',
  'مرحبا {{customer_name}}! 🎉 شكرا على التواصل مع {{store_name}}. كيف نقدر نعاونك اليوم؟',
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
  'سلام {{customer_name}}! واش راك؟ نتمنى المنتوج عجبك 🙏 إذا عندك أي سؤال ولا حاجة، نحنا هنا. - {{store_name}}',
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
  'مرحبا {{customer_name}}! طلبك رقم {{order_number}} تأكد ✅ التوصيل لـ {{wilaya}}. شكرا على الثقة! - {{store_name}}',
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
  '{{customer_name}}، عندنا عرض خاص على {{product_name}}! 🔥 تقدر تزيدو لطلبك بخصم. واش رايك؟ - {{store_name}}',
  'upsell',
  'ar'
FROM sellers
WHERE NOT EXISTS (
  SELECT 1 FROM whatsapp_templates wt WHERE wt.seller_id = sellers.id AND wt.slug = 'upsell'
);

-- RLS policies
ALTER TABLE whatsapp_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sellers can view own templates"
  ON whatsapp_templates FOR SELECT
  USING (auth.uid() = seller_id);

CREATE POLICY "Sellers can insert own templates"
  ON whatsapp_templates FOR INSERT
  WITH CHECK (auth.uid() = seller_id);

CREATE POLICY "Sellers can update own templates"
  ON whatsapp_templates FOR UPDATE
  USING (auth.uid() = seller_id);

CREATE POLICY "Sellers can delete own templates"
  ON whatsapp_templates FOR DELETE
  USING (auth.uid() = seller_id);
