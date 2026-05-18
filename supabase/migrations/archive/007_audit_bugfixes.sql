-- ================================================
-- SahelFlow Migration: Bugfixes from System Audit
-- Run after 006_message_dedup.sql
-- ================================================

-- 1. Add 'draft' to orders status CHECK constraint
-- The communication agent creates orders with status 'draft' (Phase 10)
-- but the original CHECK constraint didn't include it
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('draft', 'pending', 'confirmed', 'shipped', 'delivered', 'returned', 'refused', 'cancelled'));

-- 2. Add 'pending' to deliveries status (missing from original)
ALTER TABLE public.deliveries DROP CONSTRAINT IF EXISTS deliveries_status_check;
ALTER TABLE public.deliveries ADD CONSTRAINT deliveries_status_check
  CHECK (status IN ('pending', 'created', 'picked_up', 'in_transit', 'delivered', 'returned', 'failed'));

-- 3. Improve order number generation to use sequence instead of RANDOM()
-- This prevents collisions under concurrent inserts
CREATE SEQUENCE IF NOT EXISTS public.order_number_seq START WITH 1;

CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.order_number IS NULL THEN
    NEW.order_number := 'SF-' || TO_CHAR(NOW(), 'YYMMDD') || '-' || LPAD(nextval('public.order_number_seq')::TEXT, 5, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Add unique index for automation recipe upserts
-- Prevents duplicate recipe seeding per seller
CREATE UNIQUE INDEX IF NOT EXISTS idx_automations_recipe_unique
  ON public.automations (seller_id, trigger_type, ((trigger_config->>'recipe_id')))
  WHERE trigger_config->>'recipe_id' IS NOT NULL;
