-- Dashboard aggregation RPC — replaces client-side getDashboardStats() + getCODStats()
-- Phase 49B-1: Server-side aggregation for dashboard and COD stats

CREATE OR REPLACE FUNCTION get_dashboard_aggregates()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seller_id UUID := auth.uid();
  v_result JSONB;
  v_orders_agg JSONB;
  v_cod_agg JSONB;
  v_first_of_month TIMESTAMPTZ;
  v_thirty_days_ago TIMESTAMPTZ;
BEGIN
  v_first_of_month := date_trunc('month', now());
  v_thirty_days_ago := now() - interval '30 days';

  -- Orders aggregation
  SELECT jsonb_build_object(
    'totalOrders', COUNT(*),
    'totalRevenue', COALESCE(SUM(total_price), 0),
    'totalProfit', COALESCE(SUM(net_profit), 0),
    'deliveredOrders', COUNT(*) FILTER (WHERE status = 'delivered'),
    'returnedOrders', COUNT(*) FILTER (WHERE status IN ('returned', 'refused')),
    'pendingOrders', COUNT(*) FILTER (WHERE status = 'pending'),
    'confirmedOrders', COUNT(*) FILTER (WHERE status = 'confirmed'),
    'byStatus', COALESCE(jsonb_object_agg(status, cnt), '{}'::jsonb)
  ) INTO v_orders_agg
  FROM (
    SELECT status, COUNT(*) as cnt, SUM(total_price) as total_price, SUM(net_profit) as net_profit
    FROM orders
    WHERE seller_id = v_seller_id
    GROUP BY status
  ) sub;

  -- Handle null case (no orders)
  IF v_orders_agg IS NULL THEN
    v_orders_agg := '{"totalOrders":0,"totalRevenue":0,"totalProfit":0,"deliveredOrders":0,"returnedOrders":0,"pendingOrders":0,"confirmedOrders":0,"byStatus":{}}'::jsonb;
  END IF;

  -- COD cash flow aggregation
  SELECT jsonb_build_object(
    'codInTransit', COALESCE(SUM(total_price) FILTER (WHERE status = 'shipped'), 0),
    'codCleared', COALESCE(SUM(total_price) FILTER (WHERE status = 'delivered'), 0),
    'codPendingCollection', COALESCE(SUM(total_price) FILTER (WHERE status = 'confirmed'), 0),
    'codAtRisk', COALESCE(SUM(total_price) FILTER (WHERE status IN ('returned', 'refused') AND created_at > v_thirty_days_ago), 0),
    'moneyInTransit', COALESCE(SUM(total_price) FILTER (WHERE status = 'shipped'), 0),
    'packagesAtDepot', COUNT(*) FILTER (WHERE status = 'shipped'),
    'returnsThisMonth', COUNT(*) FILTER (WHERE status IN ('returned', 'refused') AND created_at >= v_first_of_month),
    'collectedThisMonth', COALESCE(SUM(total_price) FILTER (WHERE status = 'delivered' AND COALESCE(delivered_at, created_at) >= v_first_of_month), 0)
  ) INTO v_cod_agg
  FROM orders
  WHERE seller_id = v_seller_id;

  -- Product and customer counts
  SELECT v_orders_agg || v_cod_agg || jsonb_build_object(
    'totalProducts', (SELECT COUNT(*) FROM products WHERE seller_id = v_seller_id),
    'totalCustomers', (SELECT COUNT(*) FROM customers WHERE seller_id = v_seller_id),
    'totalStock', (SELECT COALESCE(SUM(stock), 0) FROM products WHERE seller_id = v_seller_id)
  ) INTO v_result;

  -- Compute rates
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
    END
  );

  RETURN v_result;
END;
$$;
