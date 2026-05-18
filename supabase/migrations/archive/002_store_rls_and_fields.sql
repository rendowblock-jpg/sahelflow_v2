-- ================================================
-- SahelFlow Migration: Store Fields & Public Access
-- ================================================

-- 1. Add store_slug to sellers (if not already there via TS interface parity)
ALTER TABLE public.sellers 
ADD COLUMN IF NOT EXISTS store_slug TEXT UNIQUE;

-- 2. Allow public READ access to the seller profile (for branding/store settings)
-- We use "public" alias implicitly by checking if it's the right schema/condition.
-- Since it's a single-tenant per-client DB, anyone visiting the site can see the seller info.
DROP POLICY IF EXISTS "public_read_sellers" ON public.sellers;
CREATE POLICY "public_read_sellers" ON public.sellers
  FOR SELECT USING (true); 

-- 3. Allow public READ access to active products
DROP POLICY IF EXISTS "public_read_products" ON public.products;
CREATE POLICY "public_read_products" ON public.products
  FOR SELECT USING (active = true);

-- 4. Allow public INSERT into customers (for checkout)
-- The "WITH CHECK (true)" allows anonymous users to insert.
DROP POLICY IF EXISTS "public_insert_customers" ON public.customers;
CREATE POLICY "public_insert_customers" ON public.customers
  FOR INSERT WITH CHECK (true);

-- 5. Allow public INSERT into orders (for checkout)
DROP POLICY IF EXISTS "public_insert_orders" ON public.orders;
CREATE POLICY "public_insert_orders" ON public.orders
  FOR INSERT WITH CHECK (true);
