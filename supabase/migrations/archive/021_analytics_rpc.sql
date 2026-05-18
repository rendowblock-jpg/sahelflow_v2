-- Analytics RPC — replaces client-side analytics computation
-- Returns all analytics data server-side, accepting a date range filter
-- Phase 56B: Eliminates fetching 500+ orders to the browser

CREATE OR REPLACE FUNCTION get_analytics_data(p_range text DEFAULT '30d')
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seller_id UUID := auth.uid();
  v_cutoff TIMESTAMPTZ;
  v_key_metrics JSONB;
  v_status_dist JSONB;
  v_wilaya_breakdown JSONB;
  v_revenue_by_day JSONB;
  v_top_products JSONB;
BEGIN
  -- Compute cutoff based on range
  CASE p_range
    WHEN 'today' THEN v_cutoff := date_trunc('day', now());
    WHEN '7d'    THEN v_cutoff := now() - interval '7 days';
    WHEN '30d'   THEN v_cutoff := now() - interval '30 days';
    WHEN 'all'   THEN v_cutoff := '1970-01-01'::timestamptz;
    ELSE v_cutoff := now() - interval '30 days';
  END CASE;

  -- 1. Key metrics
  SELECT jsonb_build_object(
    'totalOrders', COUNT(*),
    'totalRevenue', COALESCE(SUM(total_price), 0),
    'totalDeliveryCost', COALESCE(SUM(delivery_cost), 0),
    'deliveredCount', COUNT(*) FILTER (WHERE status = 'delivered'),
    'returnedCount', COUNT(*) FILTER (WHERE status IN ('returned', 'refused')),
    'confirmedCount', COUNT(*) FILTER (WHERE status IN ('confirmed', 'shipped', 'delivered')),
    'nonDraftCount', COUNT(*) FILTER (WHERE status != 'draft'),
    'avgOrderValue', CASE WHEN COUNT(*) > 0 THEN ROUND(COALESCE(SUM(total_price), 0) / COUNT(*)) ELSE 0 END,
    'deliveryRate', CASE WHEN COUNT(*) > 0 THEN ROUND(COUNT(*) FILTER (WHERE status = 'delivered')::numeric / COUNT(*)::numeric * 100) ELSE 0 END,
    'returnRate', CASE WHEN COUNT(*) > 0 THEN ROUND(COUNT(*) FILTER (WHERE status IN ('returned', 'refused'))::numeric / COUNT(*)::numeric * 100) ELSE 0 END,
    'confirmationRate', CASE WHEN COUNT(*) FILTER (WHERE status != 'draft') > 0 THEN ROUND(COUNT(*) FILTER (WHERE status IN ('confirmed', 'shipped', 'delivered'))::numeric / COUNT(*) FILTER (WHERE status != 'draft')::numeric * 100) ELSE 0 END,
    'netProfit', COALESCE(SUM(total_price), 0) - COALESCE(SUM(delivery_cost), 0),
    'profitMargin', CASE WHEN COALESCE(SUM(total_price), 0) > 0 THEN ROUND((COALESCE(SUM(total_price), 0) - COALESCE(SUM(delivery_cost), 0))::numeric / COALESCE(SUM(total_price), 1)::numeric * 100) ELSE 0 END,
    'totalCustomers', (SELECT COUNT(*) FROM customers WHERE seller_id = v_seller_id),
    'lowStockProducts', (SELECT COUNT(*) FROM products WHERE seller_id = v_seller_id AND stock <= 5)
  ) INTO v_key_metrics
  FROM orders
  WHERE seller_id = v_seller_id AND created_at >= v_cutoff;

  -- 2. Status distribution
  SELECT COALESCE(jsonb_agg(jsonb_build_object('status', status, 'count', cnt)), '[]'::jsonb)
  INTO v_status_dist
  FROM (
    SELECT status, COUNT(*) as cnt
    FROM orders
    WHERE seller_id = v_seller_id AND created_at >= v_cutoff
    GROUP BY status
    ORDER BY cnt DESC
  ) sub;

  -- 3. Wilaya breakdown (top 8 by revenue)
  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY revenue DESC), '[]'::jsonb)
  INTO v_wilaya_breakdown
  FROM (
    SELECT
      wilaya,
      COUNT(*) as orders,
      COALESCE(SUM(total_price), 0) as revenue,
      COUNT(*) FILTER (WHERE status = 'delivered') as delivered,
      COUNT(*) FILTER (WHERE status IN ('returned', 'refused')) as returned
    FROM orders
    WHERE seller_id = v_seller_id AND created_at >= v_cutoff AND wilaya IS NOT NULL
    GROUP BY wilaya
    ORDER BY revenue DESC
    LIMIT 8
  ) t;

  -- 4. Revenue by day (last 7 days regardless of range — always shows 7-day trend)
  SELECT COALESCE(jsonb_agg(row_to_json(d) ORDER BY day), '[]'::jsonb)
  INTO v_revenue_by_day
  FROM (
    SELECT
      d.day,
      COALESCE(SUM(o.total_price), 0) as revenue
    FROM (
      SELECT generate_series(
        date_trunc('day', now()) - interval '6 days',
        date_trunc('day', now()),
        interval '1 day'
      )::date as day
    ) d
    LEFT JOIN orders o ON
      o.seller_id = v_seller_id AND
      o.created_at::date = d.day
    GROUP BY d.day
  ) d;

  -- 5. Top products by order item mentions (top 5)
  SELECT COALESCE(jsonb_agg(row_to_json(p) ORDER BY quantity DESC), '[]'::jsonb)
  INTO v_top_products
  FROM (
    SELECT
      item->>'name' as name,
      SUM(COALESCE((item->>'quantity')::int, 1)) as quantity
    FROM orders, jsonb_array_elements(items) as item
    WHERE seller_id = v_seller_id AND created_at >= v_cutoff AND items IS NOT NULL
    GROUP BY item->>'name'
    ORDER BY quantity DESC
    LIMIT 5
  ) p;

  RETURN jsonb_build_object(
    'keyMetrics', v_key_metrics,
    'statusDistribution', v_status_dist,
    'wilayaBreakdown', v_wilaya_breakdown,
    'revenueByDay', v_revenue_by_day,
    'topProducts', v_top_products,
    'range', p_range
  );
END;
$$;
