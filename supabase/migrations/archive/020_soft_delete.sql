-- Migration 020: Soft delete columns for orders, products, customers
-- Adds deleted_at + covering indexes for efficient filtering

-- ===== ORDERS =====
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_deleted_at
ON public.orders (deleted_at)
WHERE deleted_at IS NULL;

-- ===== PRODUCTS =====
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_products_deleted_at
ON public.products (deleted_at)
WHERE deleted_at IS NULL;

-- ===== CUSTOMERS =====
ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_customers_deleted_at
ON public.customers (deleted_at)
WHERE deleted_at IS NULL;

-- ===== RLS POLICY NOTES =====
-- RLS already scopes by seller_id. deleted_at is an application-layer filter.
-- No RLS policy changes needed — existing policies still apply.

-- ===== COMMENTS =====
COMMENT ON COLUMN public.orders.deleted_at IS 'Soft-delete timestamp. NULL = active. Use is("deleted_at", null) in queries.';
COMMENT ON COLUMN public.products.deleted_at IS 'Soft-delete timestamp. NULL = active.';
COMMENT ON COLUMN public.customers.deleted_at IS 'Soft-delete timestamp. NULL = active.';
