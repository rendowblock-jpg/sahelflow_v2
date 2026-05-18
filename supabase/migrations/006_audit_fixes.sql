-- ============================================================
-- Migration 006: Full Audit Fixes
-- Applied: audit pass
--
-- Resolves all issues found in the comprehensive audit:
--   1. CRITICAL   — Grant EXECUTE on atomic_update_order_status to authenticated
--   2. CRITICAL   — Fix soft-delete filtering in get_dashboard_aggregates
--   3. SECURITY   — Revoke anon/PUBLIC from analytics RPC functions
--   4. SECURITY   — Fix generate_seller_slug mutable search_path
--   5. PERFORMANCE — Fix import_batches RLS initplan (per-row auth.uid())
--   6. PERFORMANCE — Drop duplicate idx_sellers_slug index
-- ============================================================


-- 1. CRITICAL: Grant authenticated EXECUTE on atomic_update_order_status
--    Without this, every order status update from the dashboard UI fails.
--    The function has its own internal auth check (auth.uid() == seller_id).
GRANT EXECUTE ON FUNCTION public.atomic_update_order_status(UUID, TEXT) TO authenticated;


-- 2. SECURITY: Revoke anon/PUBLIC access from analytics SECURITY DEFINER functions
REVOKE ALL ON FUNCTION public.get_analytics_data(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_analytics_data(TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_dashboard_aggregates() FROM anon;

GRANT EXECUTE ON FUNCTION public.get_analytics_data(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_analytics_data(TEXT) TO service_role;


-- 3. SECURITY: Fix generate_seller_slug mutable search_path
CREATE OR REPLACE FUNCTION public.generate_seller_slug()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = 'public'
AS $$
BEGIN
  IF NEW.slug IS NULL AND NEW.business_name IS NOT NULL THEN
    NEW.slug := lower(regexp_replace(NEW.business_name, '[^a-zA-Z0-9\u0600-\u06FF]+', '-', 'g'));
    NEW.slug := regexp_replace(NEW.slug, '^-+|-+$', '', 'g');
    IF EXISTS (SELECT 1 FROM sellers WHERE slug = NEW.slug AND id != NEW.id) THEN
      NEW.slug := NEW.slug || '-' || substr(md5(random()::text), 1, 6);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


-- 4. PERFORMANCE: Fix import_batches RLS initplan
DROP POLICY IF EXISTS "import_batches_seller_select" ON public.import_batches;
DROP POLICY IF EXISTS "import_batches_seller_insert" ON public.import_batches;
DROP POLICY IF EXISTS "import_batches_seller_update" ON public.import_batches;

CREATE POLICY "import_batches_seller_select" ON public.import_batches
  FOR SELECT USING (seller_id = (SELECT auth.uid()));

CREATE POLICY "import_batches_seller_insert" ON public.import_batches
  FOR INSERT WITH CHECK (seller_id = (SELECT auth.uid()));

CREATE POLICY "import_batches_seller_update" ON public.import_batches
  FOR UPDATE USING (seller_id = (SELECT auth.uid()));


-- 5. PERFORMANCE: Drop duplicate index on sellers.slug
DROP INDEX IF EXISTS public.idx_sellers_slug;


-- 6. CRITICAL: Rebuild get_dashboard_aggregates with soft-delete filters
CREATE OR REPLACE FUNCTION public.get_dashboard_aggregates()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_seller_id UUID := auth.uid();
  v_result JSONB;
  v_first_of_month TIMESTAMPTZ;
  v_thirty_days_ago TIMESTAMPTZ;
BEGIN
  v_first_of_month := date_trunc('month', now());
  v_thirty_days_ago := now() - interval '30 days';

  SELECT jsonb_build_object(
    'totalOrders',          COALESCE((SELECT COUNT(*)         FROM orders   WHERE seller_id = v_seller_id AND deleted_at IS NULL), 0),
    'totalRevenue',         COALESCE((SELECT SUM(total_price) FROM orders   WHERE seller_id = v_seller_id AND deleted_at IS NULL), 0),
    'totalProfit',          COALESCE((SELECT SUM(net_profit)  FROM orders   WHERE seller_id = v_seller_id AND deleted_at IS NULL), 0),
    'deliveredOrders',      COALESCE((SELECT COUNT(*)         FROM orders   WHERE seller_id = v_seller_id AND deleted_at IS NULL AND status = 'delivered'), 0),
    'returnedOrders',       COALESCE((SELECT COUNT(*)         FROM orders   WHERE seller_id = v_seller_id AND deleted_at IS NULL AND status IN ('returned','refused')), 0),
    'pendingOrders',        COALESCE((SELECT COUNT(*)         FROM orders   WHERE seller_id = v_seller_id AND deleted_at IS NULL AND status = 'pending'), 0),
    'confirmedOrders',      COALESCE((SELECT COUNT(*)         FROM orders   WHERE seller_id = v_seller_id AND deleted_at IS NULL AND status = 'confirmed'), 0),
    'shippedOrders',        COALESCE((SELECT COUNT(*)         FROM orders   WHERE seller_id = v_seller_id AND deleted_at IS NULL AND status = 'shipped'), 0),
    'draftOrders',          COALESCE((SELECT COUNT(*)         FROM orders   WHERE seller_id = v_seller_id AND deleted_at IS NULL AND status = 'draft'), 0),
    'cancelledOrders',      COALESCE((SELECT COUNT(*)         FROM orders   WHERE seller_id = v_seller_id AND deleted_at IS NULL AND status = 'cancelled'), 0),
    'refusedOrders',        COALESCE((SELECT COUNT(*)         FROM orders   WHERE seller_id = v_seller_id AND deleted_at IS NULL AND status = 'refused'), 0),
    'codInTransit',         COALESCE((SELECT SUM(total_price) FROM orders   WHERE seller_id = v_seller_id AND deleted_at IS NULL AND status = 'shipped'), 0),
    'codCleared',           COALESCE((SELECT SUM(total_price) FROM orders   WHERE seller_id = v_seller_id AND deleted_at IS NULL AND status = 'delivered'), 0),
    'codPendingCollection', COALESCE((SELECT SUM(total_price) FROM orders   WHERE seller_id = v_seller_id AND deleted_at IS NULL AND status = 'confirmed'), 0),
    'codAtRisk',            COALESCE((SELECT SUM(total_price) FROM orders   WHERE seller_id = v_seller_id AND deleted_at IS NULL AND status IN ('returned','refused') AND created_at > v_thirty_days_ago), 0),
    'moneyInTransit',       COALESCE((SELECT SUM(total_price) FROM orders   WHERE seller_id = v_seller_id AND deleted_at IS NULL AND status = 'shipped'), 0),
    'packagesAtDepot',      COALESCE((SELECT COUNT(*)         FROM orders   WHERE seller_id = v_seller_id AND deleted_at IS NULL AND status = 'shipped'), 0),
    'returnsThisMonth',     COALESCE((SELECT COUNT(*)         FROM orders   WHERE seller_id = v_seller_id AND deleted_at IS NULL AND status IN ('returned','refused') AND created_at >= v_first_of_month), 0),
    'collectedThisMonth',   COALESCE((SELECT SUM(total_price) FROM orders   WHERE seller_id = v_seller_id AND deleted_at IS NULL AND status = 'delivered' AND COALESCE(delivered_at, created_at) >= v_first_of_month), 0),
    'totalProducts',        COALESCE((SELECT COUNT(*)         FROM products WHERE seller_id = v_seller_id AND deleted_at IS NULL), 0),
    'totalCustomers',       COALESCE((SELECT COUNT(*)         FROM customers WHERE seller_id = v_seller_id AND deleted_at IS NULL), 0),
    'totalStock',           COALESCE((SELECT SUM(stock)        FROM products WHERE seller_id = v_seller_id AND deleted_at IS NULL), 0)
  ) INTO v_result;

  v_result := v_result || jsonb_build_object(
    'deliveryRate', CASE
      WHEN (v_result->>'totalOrders')::int > 0
      THEN ROUND(((v_result->>'deliveredOrders')::numeric / (v_result->>'totalOrders')::numeric) * 100)
      ELSE 0
    END,
    'returnRate', CASE
      WHEN (v_result->>'totalOrders')::int > 0
      THEN ROUND(((v_result->>'returnedOrders')::numeric / (v_result->>'totalOrders')::numeric) * 100)
      ELSE 0
    END,
    'confirmationRate', CASE
      WHEN ((v_result->>'pendingOrders')::int + (v_result->>'confirmedOrders')::int + (v_result->>'shippedOrders')::int + (v_result->>'deliveredOrders')::int) > 0
      THEN ROUND(((v_result->>'confirmedOrders')::numeric + (v_result->>'shippedOrders')::numeric + (v_result->>'deliveredOrders')::numeric) /
                 ((v_result->>'pendingOrders')::numeric + (v_result->>'confirmedOrders')::numeric + (v_result->>'shippedOrders')::numeric + (v_result->>'deliveredOrders')::numeric) * 100)
      ELSE 0
    END
  );

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;
