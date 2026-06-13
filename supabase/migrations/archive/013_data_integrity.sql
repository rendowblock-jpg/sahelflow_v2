-- Migration 013: Data Integrity & Profit Calculation

-- ===== 1. SOFT DELETE FOR RETURNS =====
ALTER TABLE public.returns
ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_returns_deleted_at
ON public.returns (deleted_at)
WHERE deleted_at IS NULL;

COMMENT ON COLUMN public.returns.deleted_at IS 'Soft-delete timestamp. NULL = active. Use is("deleted_at", null) in queries.';

-- ===== 2. WEBHOOK DEDUPLICATION UNIQUE CONSTRAINT =====
ALTER TABLE public.webhook_events
DROP CONSTRAINT IF EXISTS webhook_events_seller_platform_event_unique;

ALTER TABLE public.webhook_events
ADD CONSTRAINT webhook_events_seller_platform_event_unique
UNIQUE (seller_id, platform, event_id);

-- ===== 3. ORDER NUMBER GENERATION TRIGGER ALIGNMENT =====
CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.order_number IS NULL THEN
    NEW.order_number := 'SF-' || upper(substring(to_char(now(), 'YYYYMMDDHH24MISS'), 1, 10)) || '-' || upper(substring(md5(random()::text), 1, 4));
  END IF;
  RETURN NEW;
END;
$$;

-- ===== 4. AUTH NEW USER EMPTY STRING OVERWRITE FIX =====
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.sellers (id, email, full_name, business_name)
  VALUES (
    NEW.id,
    NEW.email,
    NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
    NULLIF(NEW.raw_user_meta_data->>'business_name', '')
  );
  RETURN NEW;
END;
$$;

-- ===== 5. RPC ATOMIC CREATE ORDER FIXED PROFIT & CUSTOMER UPSERT =====
CREATE OR REPLACE FUNCTION public.atomic_create_order(
  p_seller_id UUID, p_customer_name TEXT, p_customer_phone TEXT,
  p_customer_wilaya TEXT, p_customer_commune TEXT, p_customer_address TEXT,
  p_items JSONB, p_total_price NUMERIC, p_delivery_cost NUMERIC,
  p_net_profit NUMERIC, p_wilaya TEXT, p_commune TEXT, p_address TEXT,
  p_source TEXT, p_external_id TEXT, p_notes TEXT, p_delivery_type TEXT,
  p_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_customer_id UUID;
  v_order_id UUID;
  v_order_number TEXT;
  v_item JSONB;
  v_product_id UUID;
  v_quantity INT;
  v_current_stock INT;
  v_seller_wilaya TEXT;
  v_role TEXT;
  v_cost_price NUMERIC;
  v_total_cost_of_goods NUMERIC := 0;
  v_enriched_item JSONB;
  v_enriched_items JSONB := '[]'::jsonb;
  v_net_profit NUMERIC;
BEGIN
  BEGIN
    v_role := current_setting('request.jwt.claims', true)::jsonb->>'role';
  EXCEPTION WHEN OTHERS THEN
    v_role := NULL;
  END;
  IF auth.uid() IS NULL AND COALESCE(v_role, '') != 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized: authentication required';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_seller_id THEN
    RAISE EXCEPTION 'Unauthorized: seller_id mismatch';
  END IF;

  IF p_customer_phone IS NOT NULL AND p_customer_phone != '' THEN
    INSERT INTO customers (seller_id, name, phone, wilaya, commune, address)
    VALUES (p_seller_id, p_customer_name, p_customer_phone, p_customer_wilaya, p_customer_commune, p_customer_address)
    ON CONFLICT (seller_id, phone) DO UPDATE SET
      name = COALESCE(NULLIF(EXCLUDED.name, ''), customers.name),
      wilaya = COALESCE(NULLIF(EXCLUDED.wilaya, ''), customers.wilaya),
      commune = COALESCE(NULLIF(EXCLUDED.commune, ''), customers.commune),
      address = COALESCE(NULLIF(EXCLUDED.address, ''), customers.address),
      updated_at = now()
    RETURNING id INTO v_customer_id;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := NULL;
    v_quantity := COALESCE((v_item->>'quantity')::INT, 1);
    v_cost_price := NULL;

    BEGIN
      v_product_id := (v_item->>'product_id')::UUID;
    EXCEPTION WHEN others THEN
      v_product_id := NULL;
    END;

    IF v_product_id IS NOT NULL AND v_quantity > 0 THEN
      SELECT stock, cost_price INTO v_current_stock, v_cost_price
      FROM products
      WHERE id = v_product_id AND seller_id = p_seller_id
      FOR UPDATE;

      IF v_current_stock IS NOT NULL AND v_current_stock < v_quantity THEN
        RAISE EXCEPTION 'Insufficient stock for product %. Available: %, Requested: %', v_product_id, v_current_stock, v_quantity;
      END IF;

      IF p_status = 'confirmed' AND v_current_stock IS NOT NULL THEN
        UPDATE products SET stock = stock - v_quantity, updated_at = now()
        WHERE id = v_product_id AND seller_id = p_seller_id;
      END IF;
    END IF;

    v_total_cost_of_goods := v_total_cost_of_goods + (v_quantity * COALESCE(v_cost_price, 0));
    v_enriched_item := v_item || jsonb_build_object('cost_price', v_cost_price);
    v_enriched_items := v_enriched_items || jsonb_build_array(v_enriched_item);
  END LOOP;

  -- Fallback to calculated profit if p_net_profit is 0, NULL, or equal to p_total_price
  v_net_profit := p_net_profit;
  IF v_net_profit IS NULL OR v_net_profit = 0 OR (p_total_price > 0 AND v_net_profit = p_total_price) THEN
    v_net_profit := p_total_price - v_total_cost_of_goods - p_delivery_cost;
  END IF;

  v_order_number := 'SF-' || upper(substring(to_char(now(), 'YYYYMMDDHH24MISS'), 1, 10)) || '-' || upper(substring(md5(random()::text), 1, 4));
  SELECT wilaya INTO v_seller_wilaya FROM sellers WHERE id = p_seller_id;

  INSERT INTO orders (
    seller_id, customer_id, order_number, status, source, external_id,
    items, total_price, delivery_cost, net_profit,
    wilaya, commune, address, notes, delivery_type, risk_score
  ) VALUES (
    p_seller_id, v_customer_id, v_order_number, p_status, p_source, p_external_id,
    v_enriched_items, p_total_price, p_delivery_cost, v_net_profit,
    p_wilaya, p_commune, p_address, p_notes, p_delivery_type, 0
  ) RETURNING id INTO v_order_id;

  RETURN jsonb_build_object(
    'order_id', v_order_id, 'order_number', v_order_number,
    'customer_id', v_customer_id, 'status', p_status
  );
END;
$$;

-- ===== 6. RPC GET PNL SUMMARY WITH COST_PRICE FALLBACK =====
CREATE OR REPLACE FUNCTION public.get_pnl_summary(p_period text DEFAULT '30d'::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_seller_id UUID := auth.uid();
  v_start DATE;
  v_result JSONB;
BEGIN
  IF v_seller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: not authenticated';
  END IF;

  v_start := CASE p_period
    WHEN '7d'  THEN CURRENT_DATE - INTERVAL '7 days'
    WHEN '30d' THEN CURRENT_DATE - INTERVAL '30 days'
    WHEN '90d' THEN CURRENT_DATE - INTERVAL '90 days'
    WHEN 'year' THEN DATE_TRUNC('year', CURRENT_DATE)::date
    ELSE CURRENT_DATE - INTERVAL '30 days'
  END;

  SELECT jsonb_build_object(
    'revenue', COALESCE((
      SELECT SUM(total_price) FROM public.orders
      WHERE seller_id = v_seller_id AND status = 'delivered'
        AND delivered_at::date >= v_start AND deleted_at IS NULL
    ), 0)::numeric,
    'cost_of_goods', COALESCE((
      SELECT SUM(
        COALESCE(
          (item->>'cost_price')::numeric,
          (SELECT cost_price FROM public.products WHERE id = (item->>'product_id')::uuid AND seller_id = v_seller_id),
          0
        ) * (item->>'quantity')::integer
      )
      FROM public.orders, jsonb_array_elements(items) AS item
      WHERE seller_id = v_seller_id AND status = 'delivered'
        AND delivered_at::date >= v_start AND deleted_at IS NULL
    ), 0)::numeric,
    'delivery_costs', COALESCE((
      SELECT SUM(delivery_cost) FROM public.orders
      WHERE seller_id = v_seller_id AND status IN ('delivered', 'returned', 'refused')
        AND created_at::date >= v_start AND deleted_at IS NULL
    ), 0)::numeric,
    'return_losses', COALESCE((
      SELECT SUM(delivery_cost) FROM public.orders
      WHERE seller_id = v_seller_id AND status IN ('returned', 'refused')
        AND created_at::date >= v_start AND deleted_at IS NULL
    ), 0)::numeric,
    'expenses', COALESCE((
      SELECT SUM(amount) FROM public.expenses
      WHERE seller_id = v_seller_id AND expense_date >= v_start
    ), 0)::numeric,
    'refunds', COALESCE((
      SELECT SUM(refund_amount) FROM public.returns
      WHERE seller_id = v_seller_id AND status = 'refunded'
        AND resolved_at::date >= v_start AND deleted_at IS NULL
    ), 0)::numeric,
    'orders_delivered', COALESCE((
      SELECT COUNT(*) FROM public.orders
      WHERE seller_id = v_seller_id AND status = 'delivered'
        AND delivered_at::date >= v_start AND deleted_at IS NULL
    ), 0),
    'orders_returned', COALESCE((
      SELECT COUNT(*) FROM public.orders
      WHERE seller_id = v_seller_id AND status IN ('returned', 'refused')
        AND created_at::date >= v_start AND deleted_at IS NULL
    ), 0)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- ===== 7. RPC GET DASHBOARD AGGREGATES SINGLE CTE OPTIMIZATION =====
CREATE OR REPLACE FUNCTION public.get_dashboard_aggregates(p_seller_id UUID DEFAULT NULL)
RETURNS jsonb
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
  -- Validate: either the caller IS the seller, or this is a service_role call
  IF p_seller_id IS NOT NULL THEN
    IF p_seller_id != auth.uid() AND current_setting('request.jwt.claim.role', true) != 'service_role' THEN
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

-- ===== 8. RPC GET ANALYTICS DATA CONFIRMATION RATE ALIGNMENT =====
CREATE OR REPLACE FUNCTION public.get_analytics_data(p_range text DEFAULT '30d'::text, p_seller_id UUID DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_seller_id UUID;
  v_start TIMESTAMPTZ;
  v_result JSONB;
BEGIN
  -- Validate seller_id ownership
  IF p_seller_id IS NOT NULL THEN
    IF p_seller_id != auth.uid() AND current_setting('request.jwt.claim.role', true) != 'service_role' THEN
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

-- ===== 9. RE-APPLY GRANTS FORDropped/Recreated Functions =====
REVOKE EXECUTE ON FUNCTION public.atomic_create_order(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,JSONB,NUMERIC,NUMERIC,NUMERIC,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) FROM authenticated, anon, public;
GRANT EXECUTE ON FUNCTION public.atomic_create_order(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,JSONB,NUMERIC,NUMERIC,NUMERIC,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_pnl_summary(TEXT) FROM authenticated, anon, public;
GRANT EXECUTE ON FUNCTION public.get_pnl_summary(TEXT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_dashboard_aggregates(UUID) FROM authenticated, anon, public;
GRANT EXECUTE ON FUNCTION public.get_dashboard_aggregates(UUID) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_analytics_data(TEXT, UUID) FROM authenticated, anon, public;
GRANT EXECUTE ON FUNCTION public.get_analytics_data(TEXT, UUID) TO service_role;
