-- SahelFlow v2 Comprehensive Baseline Schema
-- Generated from live DB state after storefront removal and security hardening
-- Contains all tables, indexes, constraints, functions, triggers, RLS policies, and grants

-- ============================================================
-- 1. EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 2. SEQUENCES
-- ============================================================
CREATE SEQUENCE IF NOT EXISTS order_number_seq START 1;

-- ============================================================
-- 3. TABLES
-- ============================================================

-- sellers (linked to auth.users)
CREATE TABLE IF NOT EXISTS public.sellers (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  business_name TEXT,
  phone TEXT,
  plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'starter', 'pro', 'enterprise')),
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  wilaya TEXT,
  categories TEXT[] DEFAULT '{}',
  delivery_partners TEXT[] DEFAULT '{}',
  order_sources TEXT[] DEFAULT '{}',
  onboarding_completed BOOLEAN DEFAULT false,
  shipping_rates JSONB DEFAULT '{}',
  webhook_token TEXT,
  webhook_orders_count INTEGER DEFAULT 0,
  webhook_last_sync TIMESTAMPTZ,
  whatsapp_template TEXT,
  notification_settings JSONB DEFAULT '{}'
);

-- categories
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- customers
CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  name TEXT,
  phone TEXT,
  wilaya TEXT,
  commune TEXT,
  address TEXT,
  order_count INTEGER DEFAULT 0,
  total_spent NUMERIC DEFAULT 0,
  risk_score NUMERIC DEFAULT 0,
  is_blocked BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- products
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sku TEXT,
  description TEXT,
  variants JSONB DEFAULT '[]',
  stock INTEGER DEFAULT 0,
  price NUMERIC NOT NULL DEFAULT 0,
  cost_price NUMERIC DEFAULT 0,
  image_url TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL
);

-- orders
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  order_number TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('draft', 'pending', 'confirmed', 'shipped', 'delivered', 'returned', 'refused', 'cancelled')),
  items JSONB DEFAULT '[]',
  total_price NUMERIC DEFAULT 0,
  delivery_cost NUMERIC DEFAULT 0,
  net_profit NUMERIC DEFAULT 0,
  wilaya TEXT,
  commune TEXT,
  address TEXT,
  tracking_id TEXT,
  delivery_company TEXT,
  risk_score NUMERIC DEFAULT 0,
  notes TEXT,
  confirmed_at TIMESTAMPTZ,
  shipped_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  source TEXT DEFAULT 'manual',
  external_id TEXT,
  delivery_type TEXT DEFAULT 'home' CHECK (delivery_type IN ('home', 'desk')),
  confirmation_status TEXT,
  confirmation_attempts INTEGER DEFAULT 0,
  confirmation_notes TEXT,
  return_reason TEXT,
  upsell_offered BOOLEAN DEFAULT false,
  upsell_accepted BOOLEAN DEFAULT false,
  deleted_at TIMESTAMPTZ,
  UNIQUE (seller_id, order_number)
);

-- deliveries
CREATE TABLE IF NOT EXISTS public.deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('yalidine', 'zrexpress', 'maystro', 'manual')),
  tracking_number TEXT,
  status TEXT DEFAULT 'created' CHECK (status IN ('pending', 'created', 'picked_up', 'in_transit', 'delivered', 'returned', 'failed')),
  raw_response JSONB DEFAULT '{}',
  last_sync TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- automations
CREATE TABLE IF NOT EXISTS public.automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT,
  trigger_config JSONB DEFAULT '{}',
  action_type TEXT,
  action_config JSONB DEFAULT '{}',
  active BOOLEAN DEFAULT false,
  run_count INTEGER DEFAULT 0,
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- channels
CREATE TABLE IF NOT EXISTS public.channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('whatsapp', 'messenger', 'instagram', 'telegram')),
  name TEXT,
  credentials JSONB DEFAULT '{}',
  active BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- conversations
CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  channel_id UUID REFERENCES channels(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  platform_thread_id TEXT,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'closed', 'archived')),
  unread_count INTEGER DEFAULT 0,
  last_message_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  metadata JSONB DEFAULT '{}',
  last_message_preview TEXT DEFAULT '',
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  labels TEXT[] NOT NULL DEFAULT '{}'
);

-- messages
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  content TEXT,
  content_type TEXT DEFAULT 'text' CHECK (content_type IN ('text', 'image', 'audio', 'video', 'file')),
  media_url TEXT,
  ai_extraction JSONB,
  is_ai_reply BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  platform_message_id TEXT,
  reply_to_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  quoted_text TEXT
);

-- integrations
CREATE TABLE IF NOT EXISTS public.integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  credentials JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  last_sync TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (seller_id, platform)
);

-- agent_activity
CREATE TABLE IF NOT EXISTS public.agent_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- whatsapp_templates
CREATE TABLE IF NOT EXISTS public.whatsapp_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  language TEXT NOT NULL DEFAULT 'ar',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (seller_id, slug)
);

-- webhook_retry_queue
CREATE TABLE IF NOT EXISTS public.webhook_retry_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  seller_id UUID REFERENCES sellers(id),
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  next_retry_at TIMESTAMPTZ DEFAULT now(),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'dead_letter', 'dismissed')),
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  claimed_by TEXT,
  claimed_at TIMESTAMPTZ,
  locked_until TIMESTAMPTZ
);

-- notifications
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

-- ============================================================
-- 4. INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_categories_seller ON categories (seller_id);
CREATE INDEX IF NOT EXISTS idx_customers_seller ON customers (seller_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers (seller_id, phone);
CREATE INDEX IF NOT EXISTS idx_products_seller ON products (seller_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products (category_id);
CREATE INDEX IF NOT EXISTS idx_orders_seller ON orders (seller_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (seller_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_status_created ON orders (seller_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders (customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_external_id ON orders (external_id);
CREATE INDEX IF NOT EXISTS idx_orders_conversation_id ON orders (conversation_id) WHERE conversation_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_seller_external_id ON orders (seller_id, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_pending_by_phone ON orders (seller_id, created_at DESC) WHERE status = ANY (ARRAY['draft', 'pending']);
CREATE INDEX IF NOT EXISTS idx_deliveries_seller_id ON deliveries (seller_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_order ON deliveries (order_id);
CREATE INDEX IF NOT EXISTS idx_automations_seller ON automations (seller_id);
CREATE INDEX IF NOT EXISTS idx_automations_active ON automations (seller_id, active, trigger_type) WHERE active = true;
CREATE UNIQUE INDEX IF NOT EXISTS idx_automations_recipe_unique ON automations (seller_id, trigger_type, (trigger_config ->> 'recipe_id')) WHERE (trigger_config ->> 'recipe_id') IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_channels_seller ON channels (seller_id);
CREATE INDEX IF NOT EXISTS idx_conversations_seller ON conversations (seller_id);
CREATE INDEX IF NOT EXISTS idx_conversations_customer ON conversations (customer_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_channel_thread ON conversations (channel_id, platform_thread_id) WHERE platform_thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_pinned ON conversations (seller_id, last_message_at DESC) WHERE is_pinned = true;
CREATE INDEX IF NOT EXISTS idx_conversations_archived ON conversations (seller_id, is_archived, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages (conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages (created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_dedup ON messages (conversation_id, platform_message_id) WHERE platform_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_reply_to ON messages (reply_to_id) WHERE reply_to_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agent_activity_seller ON agent_activity (seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_seller ON whatsapp_templates (seller_id, category);
CREATE INDEX IF NOT EXISTS idx_retry_queue_status ON webhook_retry_queue (status, next_retry_at);
CREATE INDEX IF NOT EXISTS idx_retry_queue_pending ON webhook_retry_queue (status, next_retry_at) WHERE status = ANY (ARRAY['pending', 'processing']);
CREATE INDEX IF NOT EXISTS idx_retry_queue_seller_id ON webhook_retry_queue (seller_id) WHERE seller_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_retry_queue_claimed_by ON webhook_retry_queue (claimed_by) WHERE claimed_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_retry_queue_locked_until ON webhook_retry_queue (locked_until) WHERE locked_until IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_seller ON notifications (seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications (seller_id, read) WHERE read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_active ON notifications (seller_id, dismissed, created_at DESC) WHERE dismissed = false;

-- ============================================================
-- 5. FUNCTIONS
-- ============================================================

-- Updated-at trigger helper
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Order number generator
CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.order_number IS NULL THEN
    NEW.order_number := 'SF-' || TO_CHAR(NOW(), 'YYMMDD') || '-' || LPAD(nextval('public.order_number_seq')::TEXT, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;

-- Auth user → seller auto-create
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
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'business_name', '')
  );
  RETURN NEW;
END;
$$;

-- Dashboard aggregates RPC (safe for empty sellers — COALESCE-wrapped individual subqueries)
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
    'totalProducts', (SELECT COUNT(*) FROM products WHERE seller_id = v_seller_id),
    'totalCustomers', (SELECT COUNT(*) FROM customers WHERE seller_id = v_seller_id),
    'totalStock', (SELECT COALESCE(SUM(stock), 0) FROM products WHERE seller_id = v_seller_id)
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

-- Analytics data RPC
CREATE OR REPLACE FUNCTION public.get_analytics_data(p_range TEXT DEFAULT '30d')
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
    WHEN '7d' THEN v_start := now() - interval '7 days';
    WHEN '30d' THEN v_start := now() - interval '30 days';
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
    FROM orders
    WHERE seller_id = v_seller_id AND created_at >= v_start
  ),
  status_dist AS (
    SELECT jsonb_agg(jsonb_build_object('status', status, 'count', cnt)) AS data
    FROM (SELECT status, COUNT(*) AS cnt FROM orders WHERE seller_id = v_seller_id AND created_at >= v_start GROUP BY status) s
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
      SELECT wilaya, COUNT(*) AS orders_count, COALESCE(SUM(total_price),0)::numeric AS revenue,
        COUNT(*) FILTER (WHERE status='delivered') AS delivered_count,
        COUNT(*) FILTER (WHERE status IN ('returned','refused')) AS returned_count
      FROM orders
      WHERE seller_id = v_seller_id AND created_at >= v_start AND wilaya IS NOT NULL
      GROUP BY wilaya
      ORDER BY orders_count DESC
      LIMIT 10
    ) w
  ),
  revenue_by_day AS (
    SELECT jsonb_agg(jsonb_build_object('day', day, 'revenue', revenue)) AS data
    FROM (
      SELECT TO_CHAR(created_at::date, 'YYYY-MM-DD') AS day, COALESCE(SUM(total_price),0)::numeric AS revenue
      FROM orders
      WHERE seller_id = v_seller_id AND created_at >= v_start
      GROUP BY created_at::date
      ORDER BY created_at::date
      LIMIT 30
    ) d
  ),
  top_prods AS (
    SELECT jsonb_agg(jsonb_build_object('name', name, 'quantity', qty)) AS data
    FROM (
      SELECT (item->>'name') AS name, COALESCE(SUM((item->>'quantity')::int), 0) AS qty
      FROM orders, jsonb_array_elements(items) AS item
      WHERE seller_id = v_seller_id AND created_at >= v_start
      GROUP BY (item->>'name')
      ORDER BY qty DESC
      LIMIT 10
    ) p
  ),
  low_stock AS (
    SELECT COUNT(*) AS cnt FROM products WHERE seller_id = v_seller_id AND stock <= 5 AND stock > 0 AND active = true
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
      'confirmationRate', CASE WHEN (os.total_orders - os.delivered_count) > 0 THEN ROUND(((os.confirmed_count + os.delivered_count)::numeric / NULLIF(os.total_orders - (SELECT COUNT(*) FROM orders WHERE seller_id = v_seller_id AND created_at >= v_start AND status='draft'), 0)) * 100) ELSE 0 END,
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

-- Atomic order creation (stock-aware)
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
      name = COALESCE(EXCLUDED.name, customers.name),
      wilaya = COALESCE(EXCLUDED.wilaya, customers.wilaya),
      commune = COALESCE(EXCLUDED.commune, customers.commune),
      address = COALESCE(EXCLUDED.address, customers.address),
      updated_at = now()
    RETURNING id INTO v_customer_id;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := NULL;
    v_quantity := COALESCE((v_item->>'quantity')::INT, 1);
    BEGIN
      v_product_id := (v_item->>'product_id')::UUID;
    EXCEPTION WHEN others THEN
      v_product_id := NULL;
    END;
    IF v_product_id IS NOT NULL AND v_quantity > 0 THEN
      SELECT stock INTO v_current_stock
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
  END LOOP;

  v_order_number := 'SF-' || upper(substring(to_char(now(), 'YYYYMMDDHH24MISS'), 1, 10)) || '-' || upper(substring(md5(random()::text), 1, 4));
  SELECT wilaya INTO v_seller_wilaya FROM sellers WHERE id = p_seller_id;

  INSERT INTO orders (
    seller_id, customer_id, order_number, status, source, external_id,
    items, total_price, delivery_cost, net_profit,
    wilaya, commune, address, notes, delivery_type, risk_score
  ) VALUES (
    p_seller_id, v_customer_id, v_order_number, p_status, p_source, p_external_id,
    p_items, p_total_price, p_delivery_cost, p_net_profit,
    p_wilaya, p_commune, p_address, p_notes, p_delivery_type, 0
  ) RETURNING id INTO v_order_id;

  RETURN jsonb_build_object(
    'order_id', v_order_id, 'order_number', v_order_number,
    'customer_id', v_customer_id, 'status', p_status
  );
END;
$$;

-- Atomic order status update (stock rollback)
CREATE OR REPLACE FUNCTION public.atomic_update_order_status(
  p_order_id UUID,
  p_new_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_current_status TEXT;
  v_seller_id UUID;
  v_customer_id UUID;
  v_items JSONB;
  v_total_price NUMERIC;
  v_item JSONB;
  v_product_id UUID;
  v_quantity INT;
  v_result JSONB;
  v_role TEXT;
BEGIN
  SELECT status, seller_id, customer_id, items, total_price
  INTO v_current_status, v_seller_id, v_customer_id, v_items, v_total_price
  FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  BEGIN
    v_role := current_setting('request.jwt.claims', true)::jsonb->>'role';
  EXCEPTION WHEN OTHERS THEN
    v_role := NULL;
  END;
  IF COALESCE(v_role, '') != 'service_role' AND auth.uid() IS DISTINCT FROM v_seller_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF v_current_status IN ('delivered', 'returned', 'refused', 'cancelled') AND p_new_status != v_current_status THEN
    RAISE EXCEPTION 'Cannot transition from terminal state %', v_current_status;
  END IF;

  IF v_current_status = p_new_status THEN
    SELECT row_to_json(orders.*) INTO v_result FROM orders WHERE id = p_order_id;
    RETURN v_result;
  END IF;

  IF p_new_status = 'confirmed' AND v_current_status != 'confirmed' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
    LOOP
      v_product_id := (v_item->>'product_id')::UUID;
      v_quantity := (v_item->>'quantity')::INT;
      IF v_product_id IS NOT NULL AND v_quantity IS NOT NULL THEN
        UPDATE products SET stock = GREATEST(0, stock - v_quantity)
        WHERE id = v_product_id AND seller_id = v_seller_id;
      END IF;
    END LOOP;
  END IF;

  IF p_new_status IN ('returned', 'cancelled', 'refused') AND v_current_status IN ('confirmed', 'shipped') THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
    LOOP
      v_product_id := (v_item->>'product_id')::UUID;
      v_quantity := (v_item->>'quantity')::INT;
      IF v_product_id IS NOT NULL AND v_quantity IS NOT NULL THEN
        UPDATE products SET stock = stock + v_quantity
        WHERE id = v_product_id AND seller_id = v_seller_id;
      END IF;
    END LOOP;
  END IF;

  UPDATE orders SET
    status = p_new_status,
    confirmed_at = CASE WHEN p_new_status = 'confirmed' THEN now() ELSE confirmed_at END,
    shipped_at = CASE WHEN p_new_status = 'shipped' THEN now() ELSE shipped_at END,
    delivered_at = CASE WHEN p_new_status = 'delivered' THEN now() ELSE delivered_at END,
    updated_at = now()
  WHERE id = p_order_id;

  IF v_customer_id IS NOT NULL AND p_new_status = 'delivered' AND v_current_status != 'delivered' THEN
    UPDATE customers SET
      order_count = COALESCE(order_count, 0) + 1,
      total_spent = COALESCE(total_spent, 0) + COALESCE(v_total_price, 0)
    WHERE id = v_customer_id;
  END IF;

  SELECT row_to_json(orders.*) INTO v_result FROM orders WHERE id = p_order_id;
  RETURN v_result;
END;
$$;

-- ============================================================
-- 6. TRIGGERS
-- ============================================================
-- Synced to live trigger name (was handle_new_user_trigger)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS update_sellers_updated_at ON sellers;
CREATE TRIGGER update_sellers_updated_at
  BEFORE UPDATE ON sellers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS update_customers_updated_at ON customers;
CREATE TRIGGER update_customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS update_products_updated_at ON products;
CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS update_orders_updated_at ON orders;
CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS set_order_number ON orders;
CREATE TRIGGER set_order_number
  BEFORE INSERT ON orders
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_order_number();

-- ============================================================
-- 7. RLS POLICIES
-- ============================================================
ALTER TABLE sellers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_retry_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- sellers
CREATE POLICY "sellers_own_data" ON sellers FOR ALL
  USING (auth.uid() = id);

-- customers
CREATE POLICY "customers_seller_only" ON customers FOR ALL
  USING (auth.uid() = seller_id);

-- products (split for Supabase)
CREATE POLICY "products_seller_write" ON products FOR INSERT
  WITH CHECK (auth.uid() = seller_id);
CREATE POLICY "products_seller_update" ON products FOR UPDATE
  USING (auth.uid() = seller_id);
CREATE POLICY "products_seller_delete" ON products FOR DELETE
  USING (auth.uid() = seller_id);
CREATE POLICY "products_seller_select" ON products FOR SELECT
  USING (auth.uid() = seller_id);

-- orders
CREATE POLICY "orders_seller_only" ON orders FOR ALL
  USING (auth.uid() = seller_id);

-- deliveries
CREATE POLICY "deliveries_seller_only" ON deliveries FOR ALL
  USING (auth.uid() = seller_id);

-- automations
CREATE POLICY "automations_seller_only" ON automations FOR ALL
  USING (auth.uid() = seller_id);

-- channels
CREATE POLICY "channels_seller_only" ON channels FOR ALL
  USING (auth.uid() = seller_id);

-- conversations
CREATE POLICY "conversations_seller_only" ON conversations FOR ALL
  USING (auth.uid() = seller_id);

-- messages
CREATE POLICY "messages_seller_only" ON messages FOR ALL
  USING (conversation_id IN (
    SELECT id FROM conversations WHERE seller_id = auth.uid()
  ));

-- integrations
CREATE POLICY "Sellers manage own integrations" ON integrations FOR ALL
  USING (auth.uid() = seller_id);

-- agent_activity
CREATE POLICY "Sellers see own activity" ON agent_activity FOR SELECT
  USING (auth.uid() = seller_id);
CREATE POLICY "System inserts activity" ON agent_activity FOR INSERT
  WITH CHECK (auth.uid() = seller_id);

-- whatsapp_templates
CREATE POLICY "Sellers can view own templates" ON whatsapp_templates FOR SELECT
  USING (auth.uid() = seller_id);
CREATE POLICY "Sellers can insert own templates" ON whatsapp_templates FOR INSERT
  WITH CHECK (auth.uid() = seller_id);
CREATE POLICY "Sellers can update own templates" ON whatsapp_templates FOR UPDATE
  USING (auth.uid() = seller_id);
CREATE POLICY "Sellers can delete own templates" ON whatsapp_templates FOR DELETE
  USING (auth.uid() = seller_id);

-- webhook_retry_queue
CREATE POLICY "Sellers can view own retry events" ON webhook_retry_queue FOR SELECT
  USING (auth.uid() = seller_id);

-- categories
CREATE POLICY "categories_seller_write" ON categories FOR INSERT
  WITH CHECK (auth.uid() = seller_id);
CREATE POLICY "categories_seller_update" ON categories FOR UPDATE
  USING (auth.uid() = seller_id);
CREATE POLICY "categories_seller_delete" ON categories FOR DELETE
  USING (auth.uid() = seller_id);
CREATE POLICY "categories_seller_select" ON categories FOR SELECT
  USING (auth.uid() = seller_id);

-- notifications
CREATE POLICY "notifications_seller_select" ON notifications FOR SELECT
  USING ((select auth.uid()) = seller_id);
CREATE POLICY "notifications_seller_insert" ON notifications FOR INSERT
  WITH CHECK ((select auth.uid()) = seller_id);
CREATE POLICY "notifications_seller_update" ON notifications FOR UPDATE
  USING ((select auth.uid()) = seller_id);
CREATE POLICY "notifications_seller_delete" ON notifications FOR DELETE
  USING ((select auth.uid()) = seller_id);

-- ============================================================
-- 9. SECURITY DEFINER HARDENING (Grants)
-- ============================================================
REVOKE ALL ON FUNCTION public.atomic_create_order(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,JSONB,NUMERIC,NUMERIC,NUMERIC,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.atomic_update_order_status(UUID,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_dashboard_aggregates() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_analytics_data(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.atomic_create_order(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,JSONB,NUMERIC,NUMERIC,NUMERIC,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.atomic_update_order_status(UUID,TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_dashboard_aggregates() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_analytics_data(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

-- handle_new_user trigger still needs authenticated for auth.users trigger path
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_analytics_data(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
