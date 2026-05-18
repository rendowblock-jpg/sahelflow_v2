-- ================================================
-- SahelFlow Migration 010: Database Schema Parity
-- Purpose: Adds missing fields that are expected by 
--          the AI Engine and Webhook integrations.
-- ================================================

-- 1. Add `source` to the orders table. 
-- The types define OrderSource as "manual" | "shopify" | "woocommerce" | "custom" | "webstore"
-- but the AI Engine uses "whatsapp". We'll just define it as TEXT to allow flexibility,
-- or enforce a CHECK constraint if strict adherence is needed. We'll use TEXT for flexibility.
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'webstore';

-- 2. Add `external_id` to the orders table.
-- Used to uniquely identify orders from Shopify/WooCommerce to prevent duplicates.
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS external_id TEXT;

-- 3. Add an index to `external_id` for quick lookups during webhook processing
CREATE INDEX IF NOT EXISTS idx_orders_external_id ON public.orders(external_id);
