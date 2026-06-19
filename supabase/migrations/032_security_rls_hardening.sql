-- ════════════════════════════════════════════════════════════════════════════
-- Migration 032: Security RLS Hardening (PR #14 — S8, S9, S12, M1, M4)
-- ════════════════════════════════════════════════════════════════════════════
-- S8:  webhook_retry_queue — team members had FOR ALL (DELETE/UPDATE).
--       Now SELECT-only for team members; service_role gets full access.
-- S9:  team_members_manage — admin could INSERT role='owner' (privilege
--       escalation). WITH CHECK now forbids role='owner'.
-- S12: products — anon could SELECT cost_price, sku, variants. Column-level
--       GRANT restricts anon to safe columns only.
-- M1:  get_dashboard_aggregates + get_analytics_data used wrong JWT setting
--       name. Auth check was dead code. Fixed.
-- M4:  Already fixed by S10 (team_members_self_select, migration 030).
-- ════════════════════════════════════════════════════════════════════════════

-- ── S8: webhook_retry_queue — SELECT-only for team, full for service_role ──

DROP POLICY IF EXISTS "webhook_retry_queue_team_access" ON public.webhook_retry_queue;
DROP POLICY IF EXISTS "webhook_retry_queue_team_select" ON public.webhook_retry_queue;
DROP POLICY IF EXISTS "webhook_retry_queue_service_all" ON public.webhook_retry_queue;

CREATE POLICY "webhook_retry_queue_team_select"
  ON public.webhook_retry_queue
  FOR SELECT TO public
  USING (public.check_user_seller_access(seller_id));

CREATE POLICY "webhook_retry_queue_service_all"
  ON public.webhook_retry_queue
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ── S9: team_members_manage — prevent role='owner' escalation ──

DROP POLICY IF EXISTS "team_members_manage" ON public.team_members;

CREATE POLICY "team_members_manage"
  ON public.team_members FOR ALL TO public
  USING (
    (auth.uid() = seller_id) OR
    (EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.seller_id = team_members.seller_id AND tm.user_id = auth.uid() AND tm.role = 'admin' AND tm.status = 'active'))
  )
  WITH CHECK (
    (
      (auth.uid() = seller_id) OR
      (EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.seller_id = team_members.seller_id AND tm.user_id = auth.uid() AND tm.role = 'admin' AND tm.status = 'active'))
    ) AND team_members.role != 'owner'
  );

-- ── S12: products — column-level GRANT for anon ──

REVOKE SELECT ON public.products FROM anon;
GRANT SELECT (
  id, seller_id, name, description, stock, price, image_url,
  active, created_at, updated_at, category_id, deleted_at
) ON public.products TO anon;

-- ── M1: Fix wrong JWT setting name in both RPC functions ──
-- The functions are recreated with the corrected JWT claim extraction.
-- Only the auth guard line changed; all business logic is unchanged.

-- get_dashboard_aggregates RPC
CREATE OR REPLACE FUNCTION public.get_dashboard_aggregates(p_seller_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_seller_id UUID;
  v_result JSONB;
  v_first_of_month TIMESTAMPTZ;
  v_thirty_days_ago TIMESTAMPTZ;
BEGIN
  IF p_seller_id IS NOT NULL THEN
    IF p_seller_id != auth.uid() AND current_setting('request.jwt.claims', true)::jsonb->>'role' != 'service_role' THEN
      RAISE EXCEPTION 'Unauthorized: seller_id mismatch';
    END IF;
    v_seller_id := p_seller_id;
  ELSE
    v_seller_id := auth.uid();
  END IF;

  v_first_of_month := date_trunc('month', now());
  v_thirty_days_ago := now() - interval '30 days';

  WITH order_stats AS (
    SELECT
      COUNT(*) AS total_orders,
      COALESCE(SUM(total_price), 0) AS total_revenue,
      COALESCE(SUM(net_profit), 0) AS total_profit,
      COUNT(*) FILTER (WHERE status = 'delivered') AS delivered_orders,
      COUNT(*) FILTER (WHERE status IN ('returned', 'refused')) AS returned_orders,
      COUNT(*) FILTER (WHERE status = 'pending') AS pending_orders,
      COUNT(*) FILTER (WHERE status = 'confirmed') AS confirmed_orders,
      COUNT(*) FILTER (WHERE status = 'shipped') AS shipped_orders,
      COUNT(*) FILTER (WHERE status = 'draft') AS draft_orders,
      COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled_orders,
      COUNT(*) FILTER (WHERE status = 'refused') AS refused_orders,
      COALESCE(SUM(total_price) FILTER (WHERE status = 'shipped'), 0) AS cod_in_transit,
      COALESCE(SUM(total_price) FILTER (WHERE status = 'delivered'), 0) AS cod_cleared,
      COALESCE(SUM(total_price) FILTER (WHERE status = 'confirmed'), 0) AS cod_pending_collection,
      COALESCE(SUM(total_price) FILTER (WHERE status IN ('returned', 'refused') AND created_at > v_thirty_days_ago), 0) AS cod_at_risk,
      COALESCE(SUM(total_price) FILTER (WHERE status = 'shipped'), 0) AS money_in_transit,
      COUNT(*) FILTER (WHERE status = 'shipped') AS packages_at_depot,
      COUNT(*) FILTER (WHERE status IN ('returned', 'refused') AND created_at >= v_first_of_month) AS returns_this_month,
      COALESCE(SUM(total_price) FILTER (WHERE status = 'delivered' AND COALESCE(delivered_at, created_at) >= v_first_of_month), 0) AS collected_this_month
    FROM public.orders
    WHERE seller_id = v_seller_id AND deleted_at IS NULL
  ),
  product_stats AS (
    SELECT
      COUNT(*) AS total_products,
      COALESCE(SUM(stock), 0) AS total_stock
    FROM public.products
    WHERE seller_id = v_seller_id AND deleted_at IS NULL
  ),
  customer_stats AS (
    SELECT
      COUNT(*) AS total_customers
    FROM public.customers
    WHERE seller_id = v_seller_id AND deleted_at IS NULL
  )
  SELECT jsonb_build_object(
    'totalOrders', os.total_orders,
    'totalRevenue', os.total_revenue,
    'totalProfit', os.total_profit,
    'deliveredOrders', os.delivered_orders,
    'returnedOrders', os.returned_orders,
    'pendingOrders', os.pending_orders,
    'confirmedOrders', os.confirmed_orders,
    'shippedOrders', os.shipped_orders,
    'draftOrders', os.draft_orders,
    'cancelledOrders', os.cancelled_orders,
    'refusedOrders', os.refused_orders,
    'codInTransit', os.cod_in_transit,
    'codCleared', os.cod_cleared,
    'codPendingCollection', os.cod_pending_collection,
    'codAtRisk', os.cod_at_risk,
    'moneyInTransit', os.money_in_transit,
    'packagesAtDepot', os.packages_at_depot,
    'returnsThisMonth', os.returns_this_month,
    'collectedThisMonth', os.collected_this_month,
    'totalProducts', ps.total_products,
    'totalCustomers', cs.total_customers,
    'totalStock', ps.total_stock
  ) INTO v_result
  FROM order_stats os
  CROSS JOIN product_stats ps
  CROSS JOIN customer_stats cs;

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

REVOKE ALL ON FUNCTION public.get_dashboard_aggregates(UUID) FROM authenticated, anon, public;
GRANT EXECUTE ON FUNCTION public.get_dashboard_aggregates(UUID) TO service_role;

-- get_analytics_data RPC
CREATE OR REPLACE FUNCTION public.get_analytics_data(p_range TEXT DEFAULT '30d', p_seller_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_seller_id UUID;
  v_start TIMESTAMPTZ;
  v_result JSONB;
BEGIN
  IF p_seller_id IS NOT NULL THEN
    IF p_seller_id != auth.uid() AND current_setting('request.jwt.claims', true)::jsonb->>'role' != 'service_role' THEN
      RAISE EXCEPTION 'Unauthorized: seller_id mismatch';
    END IF;
    v_seller_id := p_seller_id;
  ELSE
    v_seller_id := auth.uid();
  END IF;

  CASE p_range
    WHEN 'today' THEN v_start := date_trunc('day', now());
    WHEN '7d'    THEN v_start := now() - interval '7 days';
    WHEN '30d'   THEN v_start := now() - interval '30 days';
    ELSE v_start := '1970-01-01'::timestamptz;
  END CASE;

  WITH order_stats AS (
    SELECT
      COUNT(*) AS total_orders,
      COALESCE(SUM(total_price), 0) AS total_revenue,
      COALESCE(SUM(delivery_cost), 0) AS total_delivery_cost,
      COALESCE(SUM(net_profit), 0) AS net_profit,
      COUNT(*) FILTER (WHERE status = 'delivered') AS delivered_count,
      COUNT(*) FILTER (WHERE status IN ('returned','refused')) AS returned_count,
      COUNT(*) FILTER (WHERE status = 'confirmed') AS confirmed_count,
      COUNT(*) FILTER (WHERE status = 'shipped') AS shipped_count,
      COUNT(*) FILTER (WHERE status != 'draft') AS non_draft_count,
      COUNT(DISTINCT customer_id) AS total_customers
    FROM public.orders
    WHERE seller_id = v_seller_id
      AND created_at >= v_start
      AND deleted_at IS NULL
  ),
  status_dist AS (
    SELECT jsonb_agg(jsonb_build_object('status', status, 'count', cnt)) AS data
    FROM (
      SELECT status, COUNT(*) AS cnt
      FROM public.orders
      WHERE seller_id = v_seller_id AND created_at >= v_start AND deleted_at IS NULL
      GROUP BY status
    ) s
  ),
  wilaya_stats AS (
    SELECT jsonb_agg(jsonb_build_object(
      'wilaya', wilaya,
      'orders', orders_count,
      'revenue', revenue,
      'delivered', delivered_count,
      'returned', returned_count
    )) AS data
    FROM (
      SELECT
        wilaya,
        COUNT(*) AS orders_count,
        COALESCE(SUM(total_price), 0)::numeric AS revenue,
        COUNT(*) FILTER (WHERE status = 'delivered') AS delivered_count,
        COUNT(*) FILTER (WHERE status IN ('returned','refused')) AS returned_count
      FROM public.orders
      WHERE seller_id = v_seller_id AND created_at >= v_start
        AND deleted_at IS NULL AND wilaya IS NOT NULL
      GROUP BY wilaya
      ORDER BY orders_count DESC
      LIMIT 10
    ) w
  ),
  revenue_by_day AS (
    SELECT jsonb_agg(jsonb_build_object('day', day, 'revenue', revenue)) AS data
    FROM (
      SELECT
        TO_CHAR(created_at::date, 'YYYY-MM-DD') AS day,
        COALESCE(SUM(total_price), 0)::numeric AS revenue
      FROM public.orders
      WHERE seller_id = v_seller_id AND created_at >= v_start AND deleted_at IS NULL
      GROUP BY created_at::date
      ORDER BY created_at::date
      LIMIT 30
    ) d
  ),
  top_prods AS (
    SELECT jsonb_agg(jsonb_build_object('name', name, 'quantity', qty)) AS data
    FROM (
      SELECT
        (item->>'name') AS name,
        COALESCE(SUM((item->>'quantity')::int), 0) AS qty
      FROM public.orders, jsonb_array_elements(items) AS item
      WHERE seller_id = v_seller_id AND created_at >= v_start AND deleted_at IS NULL
      GROUP BY (item->>'name')
      ORDER BY qty DESC
      LIMIT 10
    ) p
  ),
  low_stock AS (
    SELECT COUNT(*) AS cnt
    FROM public.products
    WHERE seller_id = v_seller_id
      AND stock <= 5 AND stock > 0 AND active = true AND deleted_at IS NULL
  )
  SELECT jsonb_build_object(
    'keyMetrics', jsonb_build_object(
      'totalOrders', os.total_orders,
      'totalRevenue', os.total_revenue,
      'totalDeliveryCost', os.total_delivery_cost,
      'deliveredCount', os.delivered_count,
      'returnedCount', os.returned_count,
      'confirmedCount', os.confirmed_count,
      'nonDraftCount', os.non_draft_count,
      'avgOrderValue', CASE WHEN os.total_orders > 0 THEN ROUND(os.total_revenue / os.total_orders, 2) ELSE 0 END,
      'deliveryRate', CASE WHEN os.non_draft_count > 0 THEN ROUND((os.delivered_count::numeric / os.non_draft_count) * 100) ELSE 0 END,
      'returnRate', CASE WHEN os.non_draft_count > 0 THEN ROUND((os.returned_count::numeric / os.non_draft_count) * 100) ELSE 0 END,
      'confirmationRate', CASE WHEN os.non_draft_count > 0
        THEN ROUND(((os.confirmed_count + os.shipped_count + os.delivered_count)::numeric / os.non_draft_count) * 100)
        ELSE 0 END,
      'netProfit', os.net_profit,
      'profitMargin', CASE WHEN os.total_revenue > 0 THEN ROUND(((os.net_profit / os.total_revenue) * 100), 2) ELSE 0 END,
      'totalCustomers', os.total_customers,
      'lowStockProducts', ls.cnt
    ),
    'statusDistribution', COALESCE(sd.data, '[]'::jsonb),
    'wilayaBreakdown', COALESCE(ws.data, '[]'::jsonb),
    'revenueByDay', COALESCE(rbd.data, '[]'::jsonb),
    'topProducts', COALESCE(tp.data, '[]'::jsonb),
    'range', p_range
  ) INTO v_result
  FROM order_stats os
  CROSS JOIN status_dist sd
  CROSS JOIN wilaya_stats ws
  CROSS JOIN revenue_by_day rbd
  CROSS JOIN top_prods tp
  CROSS JOIN low_stock ls;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_analytics_data(TEXT, UUID) FROM authenticated, anon, public;
GRANT EXECUTE ON FUNCTION public.get_analytics_data(TEXT, UUID) TO service_role;

-- ── M4: Already fixed by S10 (migration 030) ──
-- team_members_self_select policy allows non-admin members to read their own
-- row via auth.uid() = user_id. No additional changes needed.
