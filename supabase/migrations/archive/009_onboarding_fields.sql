-- ================================================
-- SahelFlow Migration: Onboarding & UI Fields
-- ================================================

ALTER TABLE public.sellers 
ADD COLUMN IF NOT EXISTS store_name TEXT,
ADD COLUMN IF NOT EXISTS store_theme TEXT,
ADD COLUMN IF NOT EXISTS store_logo TEXT,
ADD COLUMN IF NOT EXISTS store_primary_color TEXT,
ADD COLUMN IF NOT EXISTS store_secondary_color TEXT,
ADD COLUMN IF NOT EXISTS wilaya TEXT,
ADD COLUMN IF NOT EXISTS categories TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS delivery_partners TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS order_sources TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS shipping_rates JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS webhook_token TEXT,
ADD COLUMN IF NOT EXISTS webhook_orders_count INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS webhook_last_sync TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS whatsapp_template TEXT,
ADD COLUMN IF NOT EXISTS notification_settings JSONB DEFAULT '{}';
