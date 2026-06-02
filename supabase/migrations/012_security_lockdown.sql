-- ============================================================================
-- SahelFlow v2 — Phase 1: Security Lockdown Migration
-- Covers: F-1, F-2, F-4, F-7, F-12, F-23, F-26
-- ============================================================================

-- ============================================================================

-- ============================================================================
-- F-2: Set search_path = '' on all trigger/helper functions to prevent injection
-- These 4 functions had mutable search_path or no search_path set
-- ============================================================================

CREATE OR REPLACE FUNCTION public.increment_session_message_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  UPDATE ai_chat_sessions SET message_count = message_count + 1, updated_at = now() WHERE id = NEW.session_id;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.generate_return_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.return_number IS NULL OR NEW.return_number = '' THEN
    NEW.return_number := 'RET-' || LPAD(nextval('return_number_seq')::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.log_return_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO return_notes (return_id, type, content, metadata)
    VALUES (NEW.id, 'status_change', 'Status changed from ' || OLD.status || ' to ' || NEW.status,
      jsonb_build_object('from', OLD.status, 'to', NEW.status));
  END IF;
  RETURN NEW;
END;
$function$;

-- Also harden the SECURITY DEFINER functions with explicit search_path
CREATE OR REPLACE FUNCTION public.check_user_seller_access(p_seller_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.sellers WHERE id = p_seller_id AND id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.team_members
    WHERE seller_id = p_seller_id
      AND user_id = auth.uid()
      AND status = 'active'
  );
END;
$function$;

-- ============================================================================
-- F-4: Fix RLS correlated subquery bug in team_members_manage
-- Bug: team_members_1.seller_id = team_members_1.seller_id (always true!)
-- Fix: team_members_1.seller_id = team_members.seller_id (correlated)
-- ============================================================================

DROP POLICY IF EXISTS team_members_manage ON public.team_members;

CREATE POLICY team_members_manage ON public.team_members
  FOR ALL
  TO public
  USING (
    auth.uid() = seller_id
    OR EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.seller_id = team_members.seller_id
        AND tm.user_id = (SELECT auth.uid())
        AND tm.role = 'admin'
        AND tm.status = 'active'
    )
  )
  WITH CHECK (
    auth.uid() = seller_id
    OR EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.seller_id = team_members.seller_id
        AND tm.user_id = (SELECT auth.uid())
        AND tm.role = 'admin'
        AND tm.status = 'active'
    )
  );

-- ============================================================================
-- F-4: Consolidate overlapping RLS policies
-- agent_activity: merge "System inserts activity" + "agent_activity_team_access"
-- ============================================================================

DROP POLICY IF EXISTS "System inserts activity" ON public.agent_activity;
DROP POLICY IF EXISTS agent_activity_team_access ON public.agent_activity;
DROP POLICY IF EXISTS agent_activity_all ON public.agent_activity;

CREATE POLICY agent_activity_all ON public.agent_activity
  FOR ALL
  TO public
  USING (
    (SELECT auth.uid()) = seller_id
    OR public.check_user_seller_access(seller_id)
  )
  WITH CHECK (
    (SELECT auth.uid()) = seller_id
    OR public.check_user_seller_access(seller_id)
  );

-- ai_chat_sessions: merge seller_only + team_access into single policy
DROP POLICY IF EXISTS ai_chat_sessions_seller_only ON public.ai_chat_sessions;
DROP POLICY IF EXISTS ai_chat_sessions_team_access ON public.ai_chat_sessions;
DROP POLICY IF EXISTS ai_chat_sessions_access ON public.ai_chat_sessions;

CREATE POLICY ai_chat_sessions_access ON public.ai_chat_sessions
  FOR ALL
  TO public
  USING (
    (SELECT auth.uid()) = seller_id
    OR public.check_user_seller_access(seller_id)
  )
  WITH CHECK (
    (SELECT auth.uid()) = seller_id
    OR public.check_user_seller_access(seller_id)
  );

-- ai_chat_messages: merge via_session + team_access into single policy
DROP POLICY IF EXISTS ai_chat_messages_via_session ON public.ai_chat_messages;
DROP POLICY IF EXISTS ai_chat_messages_team_access ON public.ai_chat_messages;
DROP POLICY IF EXISTS ai_chat_messages_access ON public.ai_chat_messages;

CREATE POLICY ai_chat_messages_access ON public.ai_chat_messages
  FOR ALL
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.ai_chat_sessions s
      WHERE s.id = ai_chat_messages.session_id
        AND ((SELECT auth.uid()) = s.seller_id OR public.check_user_seller_access(s.seller_id))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ai_chat_sessions s
      WHERE s.id = ai_chat_messages.session_id
        AND ((SELECT auth.uid()) = s.seller_id OR public.check_user_seller_access(s.seller_id))
    )
  );

-- team_members: replace select-only policy with unified one (manage already recreated above)
DROP POLICY IF EXISTS team_members_select ON public.team_members;

-- ============================================================================
-- F-7: Replace auth.uid() with (SELECT auth.uid()) in remaining RLS policies
-- This caches the InitPlan per-statement instead of per-row re-evaluation
-- We already handled the above policies. Check for any remaining tables.
-- ============================================================================

-- Orders
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname, tablename, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND qual LIKE '%auth.uid()%'
      AND tablename NOT IN ('agent_activity', 'ai_chat_messages', 'ai_chat_sessions', 'team_members')
  LOOP
    -- Log for review (manual replacement needed for complex policies)
    RAISE NOTICE 'Policy %.% on % still uses auth.uid() directly — consider (SELECT auth.uid())', pol.tablename, pol.policyname, pol.tablename;
  END LOOP;
END $$;

-- ============================================================================
-- F-12: Add p_seller_id to get_dashboard_aggregates and get_analytics_data
-- SECURITY DEFINER functions must validate the caller owns the seller_id
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_dashboard_aggregates(p_seller_id UUID DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
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

  SELECT jsonb_build_object(
    'totalOrders', COALESCE((SELECT COUNT(*) FROM public.orders WHERE seller_id = v_seller_id AND deleted_at IS NULL), 0),
    'totalRevenue', COALESCE((SELECT SUM(total_price) FROM public.orders WHERE seller_id = v_seller_id AND deleted_at IS NULL), 0),
    'totalProfit', COALESCE((SELECT SUM(net_profit) FROM public.orders WHERE seller_id = v_seller_id AND deleted_at IS NULL), 0),
    'deliveredOrders', COALESCE((SELECT COUNT(*) FROM public.orders WHERE seller_id = v_seller_id AND deleted_at IS NULL AND status = 'delivered'), 0),
    'returnedOrders', COALESCE((SELECT COUNT(*) FROM public.orders WHERE seller_id = v_seller_id AND deleted_at IS NULL AND status IN ('returned','refused')), 0),
    'pendingOrders', COALESCE((SELECT COUNT(*) FROM public.orders WHERE seller_id = v_seller_id AND deleted_at IS NULL AND status = 'pending'), 0),
    'confirmedOrders', COALESCE((SELECT COUNT(*) FROM public.orders WHERE seller_id = v_seller_id AND deleted_at IS NULL AND status = 'confirmed'), 0),
    'shippedOrders', COALESCE((SELECT COUNT(*) FROM public.orders WHERE seller_id = v_seller_id AND deleted_at IS NULL AND status = 'shipped'), 0),
    'draftOrders', COALESCE((SELECT COUNT(*) FROM public.orders WHERE seller_id = v_seller_id AND deleted_at IS NULL AND status = 'draft'), 0),
    'cancelledOrders', COALESCE((SELECT COUNT(*) FROM public.orders WHERE seller_id = v_seller_id AND deleted_at IS NULL AND status = 'cancelled'), 0),
    'refusedOrders', COALESCE((SELECT COUNT(*) FROM public.orders WHERE seller_id = v_seller_id AND deleted_at IS NULL AND status = 'refused'), 0),
    'codInTransit', COALESCE((SELECT SUM(total_price) FROM public.orders WHERE seller_id = v_seller_id AND deleted_at IS NULL AND status = 'shipped'), 0),
    'codCleared', COALESCE((SELECT SUM(total_price) FROM public.orders WHERE seller_id = v_seller_id AND deleted_at IS NULL AND status = 'delivered'), 0),
    'codPendingCollection', COALESCE((SELECT SUM(total_price) FROM public.orders WHERE seller_id = v_seller_id AND deleted_at IS NULL AND status = 'confirmed'), 0),
    'codAtRisk', COALESCE((SELECT SUM(total_price) FROM public.orders WHERE seller_id = v_seller_id AND deleted_at IS NULL AND status IN ('returned','refused') AND created_at > v_thirty_days_ago), 0),
    'moneyInTransit', COALESCE((SELECT SUM(total_price) FROM public.orders WHERE seller_id = v_seller_id AND deleted_at IS NULL AND status = 'shipped'), 0),
    'packagesAtDepot', COALESCE((SELECT COUNT(*) FROM public.orders WHERE seller_id = v_seller_id AND deleted_at IS NULL AND status = 'shipped'), 0),
    'returnsThisMonth', COALESCE((SELECT COUNT(*) FROM public.orders WHERE seller_id = v_seller_id AND deleted_at IS NULL AND status IN ('returned','refused') AND created_at >= v_first_of_month), 0),
    'collectedThisMonth', COALESCE((SELECT SUM(total_price) FROM public.orders WHERE seller_id = v_seller_id AND deleted_at IS NULL AND status = 'delivered' AND COALESCE(delivered_at, created_at) >= v_first_of_month), 0),
    'totalProducts', COALESCE((SELECT COUNT(*) FROM public.products WHERE seller_id = v_seller_id AND deleted_at IS NULL), 0),
    'totalCustomers', COALESCE((SELECT COUNT(*) FROM public.customers WHERE seller_id = v_seller_id AND deleted_at IS NULL), 0),
    'totalStock', COALESCE((SELECT SUM(stock) FROM public.products WHERE seller_id = v_seller_id AND deleted_at IS NULL), 0)
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
$function$;

-- get_analytics_data: add p_seller_id with validation
CREATE OR REPLACE FUNCTION public.get_analytics_data(p_range text DEFAULT '30d'::text, p_seller_id UUID DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
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
        THEN ROUND((os.confirmed_count::numeric / os.non_draft_count) * 100)
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
$function$;

-- Harden get_pnl_summary with search_path = '' and explicit seller_id validation
CREATE OR REPLACE FUNCTION public.get_pnl_summary(p_period text DEFAULT '30d'::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
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
      SELECT SUM((item->>'cost_price')::numeric * (item->>'quantity')::integer)
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
        AND resolved_at::date >= v_start
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
$function$;

-- Harden get_product_profitability with search_path = ''
CREATE OR REPLACE FUNCTION public.get_product_profitability()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_seller_id UUID := auth.uid();
BEGIN
  IF v_seller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: not authenticated';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(t))
    FROM (
      SELECT
        p.id, p.name, p.price, p.cost_price,
        COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'delivered') as units_sold,
        COALESCE(SUM(o.total_price) FILTER (WHERE o.status = 'delivered'), 0)::numeric as total_revenue,
        COALESCE(SUM(o.net_profit) FILTER (WHERE o.status = 'delivered'), 0)::numeric as total_profit,
        COUNT(DISTINCT o.id) FILTER (WHERE o.status IN ('returned', 'refused')) as units_returned,
        ROUND(
          CASE WHEN COUNT(DISTINCT o.id) > 0
            THEN COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'delivered')::numeric / COUNT(DISTINCT o.id) * 100
            ELSE 0 END, 1
        ) as delivery_rate
      FROM public.products p
      LEFT JOIN public.orders o ON EXISTS (
        SELECT 1 FROM jsonb_array_elements(o.items) AS item
        WHERE item->>'product_id' = p.id::text
      ) AND o.seller_id = v_seller_id AND o.deleted_at IS NULL
      WHERE p.seller_id = v_seller_id AND p.deleted_at IS NULL
      GROUP BY p.id, p.name, p.price, p.cost_price
      ORDER BY total_profit DESC
    ) t
  ), '[]'::jsonb);
END;
$function$;

-- ============================================================================
-- F-23: webhook_token auto-generation + NOT NULL
-- ============================================================================
-- First, populate any existing NULL webhook_tokens with a generated value
UPDATE public.sellers SET webhook_token = gen_random_uuid()::text
WHERE webhook_token IS NULL;

-- Now make it NOT NULL
ALTER TABLE public.sellers ALTER COLUMN webhook_token SET NOT NULL;

-- ============================================================================
-- F-26: Add sellers.slug UNIQUE constraint
-- ============================================================================
ALTER TABLE public.sellers DROP CONSTRAINT IF EXISTS sellers_slug_unique;
ALTER TABLE public.sellers ADD CONSTRAINT sellers_slug_unique UNIQUE (slug);

-- ============================================================================
-- F-1: Revoke EXECUTE from authenticated/anon on SECURITY DEFINER functions
-- Only service_role should be able to call these directly
-- ============================================================================
REVOKE EXECUTE ON FUNCTION public.atomic_update_order_status(UUID, TEXT) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.check_user_seller_access(UUID) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.get_analytics_data(text, UUID) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.get_dashboard_aggregates(UUID) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.get_pnl_summary(text) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.get_product_profitability() FROM authenticated, anon;

-- ============================================================================
-- Grant service_role EXECUTE on the locked-down functions
-- (service_role already has it, but be explicit)
-- ============================================================================
GRANT EXECUTE ON FUNCTION public.get_dashboard_aggregates(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_analytics_data(text, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_pnl_summary(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_product_profitability() TO service_role;
GRANT EXECUTE ON FUNCTION public.check_user_seller_access(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.atomic_update_order_status(UUID, TEXT) TO service_role;

-- ============================================================================
-- F-75/1.9: RLS policies for public form (anon access)
-- ============================================================================
DROP POLICY IF EXISTS sellers_public_select ON public.sellers;
CREATE POLICY sellers_public_select ON public.sellers
  FOR SELECT
  TO anon
  USING (form_enabled = true);

DROP POLICY IF EXISTS products_public_select ON public.products;
CREATE POLICY products_public_select ON public.products
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.sellers s
      WHERE s.id = products.seller_id
        AND s.form_enabled = true
    )
    AND active = true
    AND stock > 0
    AND deleted_at IS NULL
  );

