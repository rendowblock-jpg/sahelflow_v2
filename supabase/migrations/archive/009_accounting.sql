-- ============================================================
-- Migration 009: Accounting & Expense Module
-- ============================================================

-- Create expenses table
CREATE TABLE public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN (
    'ads', 'packaging', 'delivery_fees', 'returns',
    'supplies', 'salary', 'rent', 'other'
  )),
  amount NUMERIC NOT NULL CHECK (amount > 0),
  description TEXT,
  receipt_url TEXT,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on expenses
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

-- RLS Policy: sellers can only manage their own expenses
CREATE POLICY expenses_seller_only ON public.expenses FOR ALL
  USING (auth.uid() = seller_id) WITH CHECK (seller_id = auth.uid());

-- Indexes for optimal performance
CREATE INDEX idx_expenses_seller_date ON public.expenses(seller_id, expense_date DESC);
CREATE INDEX idx_expenses_category ON public.expenses(seller_id, category);

-- Trigger to auto-update updated_at timestamp
CREATE TRIGGER update_expenses_updated_at
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- P&L Summary RPC
CREATE OR REPLACE FUNCTION public.get_pnl_summary(
  p_period TEXT DEFAULT '30d'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_seller_id UUID := auth.uid();
  v_start DATE;
  v_result JSONB;
BEGIN
  -- Calculate start date based on period
  v_start := CASE p_period
    WHEN '7d' THEN CURRENT_DATE - INTERVAL '7 days'
    WHEN '30d' THEN CURRENT_DATE - INTERVAL '30 days'
    WHEN '90d' THEN CURRENT_DATE - INTERVAL '90 days'
    WHEN 'year' THEN DATE_TRUNC('year', CURRENT_DATE)::date
    ELSE CURRENT_DATE - INTERVAL '30 days'
  END;

  SELECT jsonb_build_object(
    'revenue', COALESCE((
      SELECT SUM(total_price) FROM orders 
      WHERE seller_id = v_seller_id AND status = 'delivered' 
      AND delivered_at::date >= v_start AND deleted_at IS NULL
    ), 0)::numeric,
    'cost_of_goods', COALESCE((
      SELECT SUM((item->>'cost_price')::numeric * (item->>'quantity')::integer)
      FROM orders, jsonb_array_elements(items) AS item
      WHERE seller_id = v_seller_id AND status = 'delivered'
      AND delivered_at::date >= v_start AND deleted_at IS NULL
    ), 0)::numeric,
    'delivery_costs', COALESCE((
      SELECT SUM(delivery_cost) FROM orders
      WHERE seller_id = v_seller_id AND status IN ('delivered', 'returned', 'refused')
      AND created_at::date >= v_start AND deleted_at IS NULL
    ), 0)::numeric,
    'return_losses', COALESCE((
      SELECT SUM(delivery_cost) FROM orders
      WHERE seller_id = v_seller_id AND status IN ('returned', 'refused')
      AND created_at::date >= v_start AND deleted_at IS NULL
    ), 0)::numeric,
    'expenses', COALESCE((
      SELECT SUM(amount) FROM expenses
      WHERE seller_id = v_seller_id AND expense_date >= v_start
    ), 0)::numeric,
    'refunds', COALESCE((
      SELECT SUM(refund_amount) FROM returns
      WHERE seller_id = v_seller_id AND status = 'refunded'
      AND resolved_at::date >= v_start
    ), 0)::numeric,
    'orders_delivered', COALESCE((
      SELECT COUNT(*) FROM orders
      WHERE seller_id = v_seller_id AND status = 'delivered'
      AND delivered_at::date >= v_start AND deleted_at IS NULL
    ), 0),
    'orders_returned', COALESCE((
      SELECT COUNT(*) FROM orders
      WHERE seller_id = v_seller_id AND status IN ('returned', 'refused')
      AND created_at::date >= v_start AND deleted_at IS NULL
    ), 0)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- Per-product profitability RPC
CREATE OR REPLACE FUNCTION public.get_product_profitability()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_seller_id UUID := auth.uid();
BEGIN
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
      FROM products p
      LEFT JOIN orders o ON o.items @> jsonb_build_array(jsonb_build_object('product_id', p.id::text))
        AND o.seller_id = v_seller_id AND o.deleted_at IS NULL
      WHERE p.seller_id = v_seller_id AND p.deleted_at IS NULL
      GROUP BY p.id, p.name, p.price, p.cost_price
      ORDER BY total_profit DESC
    ) t
  ), '[]'::jsonb);
END;
$$;

-- Secure functions to authenticated and service_role only
REVOKE ALL ON FUNCTION public.get_pnl_summary(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_pnl_summary(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_pnl_summary(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pnl_summary(TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.get_product_profitability() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_product_profitability() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_product_profitability() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_product_profitability() TO service_role;
