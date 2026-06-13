-- 003_select_rls_and_cleanup.sql
-- Fix missing SELECT RLS policies on products and categories
-- Clean up icom from deliveries CHECK (removed from system)

-- ============================================================
-- 1. ADD MISSING SELECT RLS POLICIES
-- Products and categories had INSERT/UPDATE/DELETE but no SELECT
-- This caused the products page to return empty arrays
-- ============================================================

DROP POLICY IF EXISTS "products_seller_select" ON public.products;
CREATE POLICY "products_seller_select" ON public.products FOR SELECT
  USING ((select auth.uid()) = seller_id);

DROP POLICY IF EXISTS "categories_seller_select" ON public.categories;
CREATE POLICY "categories_seller_select" ON public.categories FOR SELECT
  USING ((select auth.uid()) = seller_id);

-- ============================================================
-- 2. REMOVE 'icom' FROM DELIVERIES PROVIDER CHECK
-- 'icom' delivery provider was removed from the system.
-- The TypeScript type doesn't include it; keep DB in sync.
-- ============================================================

ALTER TABLE public.deliveries DROP CONSTRAINT IF EXISTS deliveries_provider_check;
ALTER TABLE public.deliveries ADD CONSTRAINT deliveries_provider_check
  CHECK (provider IN ('yalidine', 'zrexpress', 'maystro', 'manual'));
