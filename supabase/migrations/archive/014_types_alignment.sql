-- Migration 014: TypeScript ↔ Database Type Alignment
-- Aligns database column constraints and defaults with TypeScript types

-- ===== 1. orders.source CHECK CONSTRAINT =====
-- Drop existing check if any, and add updated check constraint supporting 'ai', 'messenger', 'form', 'whatsapp', and 'store'
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_source_check;

ALTER TABLE public.orders ADD CONSTRAINT orders_source_check CHECK (
  source IN ('draft', 'manual', 'shopify', 'woocommerce', 'youcan', 'custom', 'ai', 'messenger', 'form', 'whatsapp', 'store')
);

-- ===== 2. deliveries.status DEFAULT ALIGNMENT =====
-- Set default to 'pending' to align with TypeScript DeliveryStatus start state
ALTER TABLE public.deliveries ALTER COLUMN status SET DEFAULT 'pending';

-- ===== 3. sellers.notification_settings DEFAULT =====
-- Set rich boolean default settings to prevent undefined property access in the UI at runtime
ALTER TABLE public.sellers ALTER COLUMN notification_settings SET DEFAULT '{"newOrders":true,"confirmations":true,"highRisk":true,"lowStock":true,"delivery":true,"weekly":true}'::jsonb;

-- ===== 4. sellers.webhook_token HARDENING =====
-- Ensure all existing sellers have a secure webhook token
UPDATE public.sellers
SET webhook_token = encode(extensions.gen_random_bytes(16), 'hex')
WHERE webhook_token IS NULL;

-- Enforce NOT NULL on webhook_token and set a secure default for future inserts
ALTER TABLE public.sellers ALTER COLUMN webhook_token SET NOT NULL;
ALTER TABLE public.sellers ALTER COLUMN webhook_token SET DEFAULT encode(extensions.gen_random_bytes(16), 'hex');

-- ===== 5. sellers.slug UNIQUE CONSTRAINT =====
-- Add unique constraint on seller slug
ALTER TABLE public.sellers DROP CONSTRAINT IF EXISTS sellers_slug_unique;
ALTER TABLE public.sellers ADD CONSTRAINT sellers_slug_unique UNIQUE (slug);
