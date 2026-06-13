-- ============================================================
-- Phase 2: Multi-Source Import Engine
-- Migration 005: Import History + Seller Slug for Order Forms
-- ============================================================

-- 1. Import Batches Table
CREATE TABLE IF NOT EXISTS public.import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('csv', 'xlsx', 'sheets', 'form', 'manual', 'youcan', 'shopify', 'woocommerce')),
  filename TEXT,
  row_count INTEGER DEFAULT 0,
  processed_count INTEGER DEFAULT 0,
  created_count INTEGER DEFAULT 0,
  skipped_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  column_mapping JSONB DEFAULT '{}',
  validation_errors JSONB DEFAULT '[]',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'preview', 'processing', 'completed', 'failed', 'cancelled')),
  committed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_import_batches_seller ON import_batches(seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_import_batches_status ON import_batches(status);

ALTER TABLE import_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY import_batches_seller_select ON import_batches
  FOR SELECT USING (seller_id = auth.uid());

CREATE POLICY import_batches_seller_insert ON import_batches
  FOR INSERT WITH CHECK (seller_id = auth.uid());

CREATE POLICY import_batches_seller_update ON import_batches
  FOR UPDATE USING (seller_id = auth.uid());

-- 2. Seller Slug for Public Order Forms
ALTER TABLE public.sellers
  ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS form_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS form_config JSONB DEFAULT '{
    "showPrices": true,
    "requirePhone": true,
    "showWilaya": true,
    "showCommune": true,
    "showAddress": true,
    "showNotes": true,
    "customFields": []
  }';

CREATE UNIQUE INDEX IF NOT EXISTS idx_sellers_slug ON sellers(slug);

-- 3. Form Orders (track orders created via public form)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS form_metadata JSONB DEFAULT NULL;

-- 4. Function to generate slug from business_name
CREATE OR REPLACE FUNCTION public.generate_seller_slug()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.slug IS NULL AND NEW.business_name IS NOT NULL THEN
    NEW.slug := lower(regexp_replace(NEW.business_name, '[^a-zA-Z0-9\u0600-\u06FF]+', '-', 'g'));
    NEW.slug := regexp_replace(NEW.slug, '^-+|-+$', '', 'g');
    -- Ensure uniqueness by appending random suffix if conflict
    IF EXISTS (SELECT 1 FROM sellers WHERE slug = NEW.slug AND id != NEW.id) THEN
      NEW.slug := NEW.slug || '-' || substr(md5(random()::text), 1, 6);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_generate_seller_slug ON sellers;
CREATE TRIGGER trigger_generate_seller_slug
  BEFORE INSERT OR UPDATE OF business_name ON sellers
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_seller_slug();
