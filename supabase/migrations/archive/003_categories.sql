-- ================================================
-- SahelFlow Migration: Product Categories
-- ================================================

-- 1. Categories table
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Add category_id to products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL;

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_categories_seller ON public.categories(seller_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category_id);

-- 4. RLS
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "categories_seller_only" ON public.categories
  FOR ALL USING (seller_id = auth.uid());

CREATE POLICY "categories_public_read" ON public.categories
  FOR SELECT USING (true);
