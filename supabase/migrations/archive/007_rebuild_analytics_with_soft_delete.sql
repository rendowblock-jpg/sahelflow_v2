-- ============================================================
-- Migration 007: Rebuild get_analytics_data with soft-delete filter
-- Must DROP first because CREATE OR REPLACE cannot remove parameter defaults.
-- ============================================================

DROP FUNCTION IF EXISTS public.get_analytics_data(TEXT);

CREATE FUNCTION public.get_analytics_data(p_range TEXT DEFAULT '30d')
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_seller_id UUID := auth.uid();
  v_start TIMESTAMPTZ;
  v_result JSONB;
BEGIN
  CASE p_range
    WHEN 'today' THEN v_start := date_trunc('day', now());
    WHEN '7d'    THEN v_start := now() - interval '7 days';
    WHEN '30d'   THEN v_start := now() - interval '30 days';
    ELSE              v_start := '1970-01-01'::timestamptz;
  END CASE;

  WITH order_stats AS (
    SELECT
      COUNT(*)                                                        AS total_orders,
      COALESCE(SUM(total_price), 0)                                   AS total_revenue,
      COALESCE(SUM(delivery_cost), 0)                                 AS total_delivery_cost,
      COALESCE(SUM(net_profit), 0)                                    AS net_profit,
      COUNT(*) FILTER (WHERE status = 'delivered')                    AS delivered_count,
      COUNT(*) FILTER (WHERE status IN ('returned','refused'))        AS returned_count,
      COUNT(*) FILTER (WHERE status = 'confirmed')                    AS confirmed_count,
      COUNT(*) FILTER (WHERE status != 'draft')                       AS non_draft_count,
      COUNT(DISTINCT customer_id)                                     AS total_customers
    FROM orders
    WHERE seller_id = v_seller_id
      AND created_at >= v_start
      AND deleted_at IS NULL
  ),
  status_dist AS (
    SELECT jsonb_agg(jsonb_build_object('status', status, 'count', cnt)) AS data
    FROM (
      SELECT status, COUNT(*) AS cnt
      FROM orders
      WHERE seller_id = v_seller_id AND created_at >= v_start AND deleted_at IS NULL
      GROUP BY status
    ) s
  ),
  wilaya_stats AS (
    SELECT jsonb_agg(jsonb_build_object(
      'wilaya',   wilaya,
      'orders',   orders_count,
      'revenue',  revenue,
      'delivered', delivered_count,
      'returned', returned_count
    )) AS data
    FROM (
      SELECT
        wilaya,
        COUNT(*)                                                     AS orders_count,
        COALESCE(SUM(total_price), 0)::numeric                       AS revenue,
        COUNT(*) FILTER (WHERE status = 'delivered')                 AS delivered_count,
        COUNT(*) FILTER (WHERE status IN ('returned','refused'))     AS returned_count
      FROM orders
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
        TO_CHAR(created_at::date, 'YYYY-MM-DD')        AS day,
        COALESCE(SUM(total_price), 0)::numeric          AS revenue
      FROM orders
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
        (item->>'name')                                   AS name,
        COALESCE(SUM((item->>'quantity')::int), 0)        AS qty
      FROM orders, jsonb_array_elements(items) AS item
      WHERE seller_id = v_seller_id AND created_at >= v_start AND deleted_at IS NULL
      GROUP BY (item->>'name')
      ORDER BY qty DESC
      LIMIT 10
    ) p
  ),
  low_stock AS (
    SELECT COUNT(*) AS cnt
    FROM products
    WHERE seller_id = v_seller_id
      AND stock <= 5 AND stock > 0 AND active = true AND deleted_at IS NULL
  )
  SELECT jsonb_build_object(
    'keyMetrics', jsonb_build_object(
      'totalOrders',       os.total_orders,
      'totalRevenue',      os.total_revenue,
      'totalDeliveryCost', os.total_delivery_cost,
      'deliveredCount',    os.delivered_count,
      'returnedCount',     os.returned_count,
      'confirmedCount',    os.confirmed_count,
      'nonDraftCount',     os.non_draft_count,
      'avgOrderValue',     CASE WHEN os.total_orders > 0 THEN ROUND(os.total_revenue / os.total_orders, 2) ELSE 0 END,
      'deliveryRate',      CASE WHEN os.non_draft_count > 0 THEN ROUND((os.delivered_count::numeric / os.non_draft_count) * 100) ELSE 0 END,
      'returnRate',        CASE WHEN os.non_draft_count > 0 THEN ROUND((os.returned_count::numeric / os.non_draft_count) * 100) ELSE 0 END,
      'confirmationRate',  CASE WHEN (os.total_orders - os.delivered_count) > 0
                                THEN ROUND(((os.confirmed_count + os.delivered_count)::numeric /
                                           NULLIF(os.total_orders - (
                                             SELECT COUNT(*) FROM orders
                                             WHERE seller_id = v_seller_id AND created_at >= v_start
                                               AND deleted_at IS NULL AND status = 'draft'
                                           ), 0)) * 100)
                                ELSE 0 END,
      'netProfit',         os.net_profit,
      'profitMargin',      CASE WHEN os.total_revenue > 0 THEN ROUND(((os.net_profit / os.total_revenue) * 100), 2) ELSE 0 END,
      'totalCustomers',    os.total_customers,
      'lowStockProducts',  ls.cnt
    ),
    'statusDistribution', COALESCE(sd.data, '[]'::jsonb),
    'wilayaBreakdown',    COALESCE(ws.data, '[]'::jsonb),
    'revenueByDay',       COALESCE(rbd.data, '[]'::jsonb),
    'topProducts',        COALESCE(tp.data, '[]'::jsonb),
    'range',              p_range
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

-- Re-apply correct grants (function was dropped, must re-grant)
REVOKE ALL ON FUNCTION public.get_analytics_data(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_analytics_data(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_analytics_data(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_analytics_data(TEXT) TO service_role;
