-- 001_fix_dashboard_and_notifications.sql
-- Fix get_dashboard_aggregates() broken by grouped subquery (total_price not available in sub)
-- + Add notifications table, policies, indexes, permissions

-- ============================================================
-- 1. FIX get_dashboard_aggregates (correct direct aggregates)
-- ============================================================
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
    'totalOrders', COALESCE((SELECT COUNT(*) FROM orders WHERE seller_id = v_seller_id), 0),
    'totalRevenue', COALESCE((SELECT SUM(total_price) FROM orders WHERE seller_id = v_seller_id), 0),
    'totalProfit', COALESCE((SELECT SUM(net_profit) FROM orders WHERE seller_id = v_seller_id), 0),
    'deliveredOrders', COALESCE((SELECT COUNT(*) FROM orders WHERE seller_id = v_seller_id AND status = 'delivered'), 0),
    'returnedOrders', COALESCE((SELECT COUNT(*) FROM orders WHERE seller_id = v_seller_id AND status IN ('returned', 'refused')), 0),
    'pendingOrders', COALESCE((SELECT COUNT(*) FROM orders WHERE seller_id = v_seller_id AND status = 'pending'), 0),
    'confirmedOrders', COALESCE((SELECT COUNT(*) FROM orders WHERE seller_id = v_seller_id AND status = 'confirmed'), 0),
    'shippedOrders', COALESCE((SELECT COUNT(*) FROM orders WHERE seller_id = v_seller_id AND status = 'shipped'), 0),
    'draftOrders', COALESCE((SELECT COUNT(*) FROM orders WHERE seller_id = v_seller_id AND status = 'draft'), 0),
    'cancelledOrders', COALESCE((SELECT COUNT(*) FROM orders WHERE seller_id = v_seller_id AND status = 'cancelled'), 0),
    'refusedOrders', COALESCE((SELECT COUNT(*) FROM orders WHERE seller_id = v_seller_id AND status = 'refused'), 0),
    'codInTransit', COALESCE((SELECT SUM(total_price) FROM orders WHERE seller_id = v_seller_id AND status = 'shipped'), 0),
    'codCleared', COALESCE((SELECT SUM(total_price) FROM orders WHERE seller_id = v_seller_id AND status = 'delivered'), 0),
    'codPendingCollection', COALESCE((SELECT SUM(total_price) FROM orders WHERE seller_id = v_seller_id AND status = 'confirmed'), 0),
    'codAtRisk', COALESCE((SELECT SUM(total_price) FROM orders WHERE seller_id = v_seller_id AND status IN ('returned', 'refused') AND created_at > v_thirty_days_ago), 0),
    'moneyInTransit', COALESCE((SELECT SUM(total_price) FROM orders WHERE seller_id = v_seller_id AND status = 'shipped'), 0),
    'packagesAtDepot', COALESCE((SELECT COUNT(*) FROM orders WHERE seller_id = v_seller_id AND status = 'shipped'), 0),
    'returnsThisMonth', COALESCE((SELECT COUNT(*) FROM orders WHERE seller_id = v_seller_id AND status IN ('returned', 'refused') AND created_at >= v_first_of_month), 0),
    'collectedThisMonth', COALESCE((SELECT SUM(total_price) FROM orders WHERE seller_id = v_seller_id AND status = 'delivered' AND COALESCE(delivered_at, created_at) >= v_first_of_month), 0),
    'totalProducts', COALESCE((SELECT COUNT(*) FROM products WHERE seller_id = v_seller_id), 0),
    'totalCustomers', COALESCE((SELECT COUNT(*) FROM customers WHERE seller_id = v_seller_id), 0),
    'totalStock', COALESCE((SELECT SUM(stock) FROM products WHERE seller_id = v_seller_id), 0)
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
      THEN ROUND(((v_result->>'confirmedOrders')::numeric + (v_result->>'shippedOrders')::numeric + (v_result->>'deliveredOrders')::numeric) / ((v_result->>'pendingOrders')::numeric + (v_result->>'confirmedOrders')::numeric + (v_result->>'shippedOrders')::numeric + (v_result->>'deliveredOrders')::numeric) * 100)
      ELSE 0
    END
  );

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

-- ============================================================
-- 2. NOTIFICATIONS TABLE (if not exists)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('order', 'low_stock', 'risk', 'automation', 'system', 'welcome')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  link TEXT,
  read BOOLEAN NOT NULL DEFAULT false,
  dismissed BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_seller ON notifications (seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications (seller_id, read) WHERE read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_active ON notifications (seller_id, dismissed, created_at DESC) WHERE dismissed = false;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "notifications_seller_select" ON notifications FOR SELECT USING (auth.uid() = seller_id);
CREATE POLICY "notifications_seller_insert" ON notifications FOR INSERT WITH CHECK (auth.uid() = seller_id);
CREATE POLICY "notifications_seller_update" ON notifications FOR UPDATE USING (auth.uid() = seller_id);
CREATE POLICY "notifications_seller_delete" ON notifications FOR DELETE USING (auth.uid() = seller_id);

-- Permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO service_role;

-- Revoke anon access
REVOKE ALL ON public.notifications FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_dashboard_aggregates() FROM anon;
