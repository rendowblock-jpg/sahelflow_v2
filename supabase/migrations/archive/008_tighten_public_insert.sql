-- ================================================
-- SahelFlow Migration: Tighten Public INSERT Policies
-- Run after 007_audit_bugfixes.sql
-- Prevents bots from inserting garbage data via checkout
-- ================================================

-- Tighten customer inserts: require at minimum a phone number
DROP POLICY IF EXISTS "public_insert_customers" ON public.customers;
CREATE POLICY "public_insert_customers" ON public.customers
  FOR INSERT WITH CHECK (
    phone IS NOT NULL AND
    length(trim(phone)) >= 9
  );

-- Tighten order inserts: require at minimum seller_id, wilaya, and items
DROP POLICY IF EXISTS "public_insert_orders" ON public.orders;
CREATE POLICY "public_insert_orders" ON public.orders
  FOR INSERT WITH CHECK (
    seller_id IS NOT NULL AND
    wilaya IS NOT NULL AND
    length(trim(wilaya)) >= 2 AND
    items IS NOT NULL AND
    jsonb_array_length(items) > 0
  );
