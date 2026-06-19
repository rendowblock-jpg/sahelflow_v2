-- SahelFlow v2 Comprehensive Baseline Schema
-- Consolidated from baseline and all patch migrations (001 - 024)
-- Contains all tables, indexes, constraints, functions, triggers, RLS policies, and grants.

-- ============================================================
-- 1. EXTENSIONS & SEQUENCES
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE SEQUENCE IF NOT EXISTS order_number_seq START 1;
CREATE SEQUENCE IF NOT EXISTS return_number_seq START 1000;

-- ============================================================
-- 2. TABLES
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
  webhook_token TEXT NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  webhook_orders_count INTEGER DEFAULT 0,
  webhook_last_sync TIMESTAMPTZ,
  notification_settings JSONB DEFAULT '{"newOrders":true,"confirmations":true,"highRisk":true,"lowStock":true,"delivery":true,"weekly":true}'::jsonb,
  slug TEXT UNIQUE,
  form_enabled BOOLEAN DEFAULT false,
  form_config JSONB DEFAULT '{"showNotes": true, "showPrices": true, "showWilaya": true, "showAddress": true, "showCommune": true, "customFields": [], "requirePhone": true}'::jsonb,
  default_locale TEXT NOT NULL DEFAULT 'ar' CHECK (default_locale IN ('ar', 'fr', 'en'))
);

-- team_members
CREATE TABLE IF NOT EXISTS public.team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'confirmer', 'packer', 'viewer')),
  status TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'suspended')),
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_at TIMESTAMPTZ DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- categories
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- products
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sku TEXT,
  description TEXT,
  variants JSONB DEFAULT '[]',
  stock INTEGER DEFAULT 0,
  price NUMERIC NOT NULL DEFAULT 0,
  cost_price NUMERIC,
  image_url TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL
);

-- customers
CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
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
  deleted_at TIMESTAMPTZ,
  UNIQUE (seller_id, phone)
);

-- channels
CREATE TABLE IF NOT EXISTS public.channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('whatsapp', 'messenger', 'instagram', 'telegram')),
  name TEXT,
  credentials JSONB DEFAULT '{}',
  active BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- conversations
CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
  channel_id UUID REFERENCES public.channels(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
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
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  content TEXT,
  content_type TEXT DEFAULT 'text' CHECK (content_type IN ('text', 'image', 'audio', 'video', 'file')),
  media_url TEXT,
  ai_extraction JSONB,
  is_ai_reply BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  platform_message_id TEXT,
  reply_to_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  quoted_text TEXT
);

-- orders
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
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
  source TEXT DEFAULT 'manual' CHECK (source IN ('draft', 'manual', 'shopify', 'woocommerce', 'youcan', 'custom', 'ai', 'messenger', 'form', 'whatsapp', 'store')),
  external_id TEXT,
  delivery_type TEXT DEFAULT 'home' CHECK (delivery_type IN ('home', 'desk')),
  confirmation_status TEXT,
  confirmation_attempts INTEGER DEFAULT 0,
  confirmation_notes TEXT,
  upsell_offered BOOLEAN DEFAULT false,
  upsell_accepted BOOLEAN DEFAULT false,
  deleted_at TIMESTAMPTZ,
  form_metadata JSONB,
  UNIQUE (seller_id, order_number)
);

-- deliveries
CREATE TABLE IF NOT EXISTS public.deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('yalidine', 'zrexpress', 'maystro', 'manual')),
  tracking_number TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'created', 'picked_up', 'in_transit', 'at_hub', 'out_for_delivery', 'delivered', 'returned', 'refused', 'failed')),
  raw_response JSONB DEFAULT '{}',
  last_sync TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- automations
CREATE TABLE IF NOT EXISTS public.automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
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

-- integrations
CREATE TABLE IF NOT EXISTS public.integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
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
  seller_id UUID NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- whatsapp_templates
CREATE TABLE IF NOT EXISTS public.whatsapp_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
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
  seller_id UUID REFERENCES public.sellers(id),
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

-- webhook_events (store webhooks deduplication)
CREATE TABLE IF NOT EXISTS public.webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  event_id TEXT NOT NULL,
  topic TEXT,
  received_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (seller_id, platform, event_id)
);

-- notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('order', 'low_stock', 'risk', 'automation', 'system', 'welcome')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  link TEXT,
  read BOOLEAN NOT NULL DEFAULT false,
  dismissed BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- import_batches
CREATE TABLE IF NOT EXISTS public.import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('csv', 'xlsx', 'sheets', 'form', 'manual', 'youcan', 'shopify', 'woocommerce')),
  filename TEXT,
  row_count INTEGER DEFAULT 0,
  processed_count INTEGER DEFAULT 0,
  created_count INTEGER DEFAULT 0,
  skipped_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  column_mapping JSONB DEFAULT '{}',
  validation_errors JSONB DEFAULT '[]',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'preview', 'processing', 'completed', 'failed', 'cancelled')),
  committed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ai_chat_sessions
CREATE TABLE IF NOT EXISTS public.ai_chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'محادثة جديدة',
  message_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ai_chat_messages
CREATE TABLE IF NOT EXISTS public.ai_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.ai_chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  tool_calls JSONB,
  action_cards JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- returns
CREATE TABLE IF NOT EXISTS public.returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers(id),
  return_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'approved', 'pickup', 'received', 'inspected', 'refunded', 'exchanged', 'rejected', 'closed')),
  reason TEXT NOT NULL CHECK (reason IN ('wrong_product', 'damaged', 'changed_mind', 'not_as_described', 'wrong_size', 'defective', 'late_delivery', 'other')),
  reason_details TEXT,
  resolution_type TEXT DEFAULT 'refund' CHECK (resolution_type IN ('refund', 'exchange', 'credit', 'reject')),
  refund_amount NUMERIC(12,2) DEFAULT 0,
  exchange_order_id UUID REFERENCES public.orders(id),
  items JSONB NOT NULL DEFAULT '[]',
  photos TEXT[] DEFAULT '{}',
  return_tracking_id TEXT,
  return_delivery_company TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- return_notes
CREATE TABLE IF NOT EXISTS public.return_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id UUID NOT NULL REFERENCES public.returns(id) ON DELETE CASCADE,
  author_id UUID REFERENCES public.sellers(id),
  type TEXT NOT NULL DEFAULT 'note' CHECK (type IN ('note', 'status_change', 'system', 'customer')),
  content TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- expenses
CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('ads', 'packaging', 'delivery_fees', 'returns', 'supplies', 'salary', 'rent', 'other')),
  amount NUMERIC NOT NULL CHECK (amount > 0),
  description TEXT,
  receipt_url TEXT,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- daily_analytics_reports
CREATE TABLE IF NOT EXISTS public.daily_analytics_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
  report_date DATE NOT NULL,
  total_orders INTEGER NOT NULL DEFAULT 0,
  confirmed_orders INTEGER NOT NULL DEFAULT 0,
  shipped_orders INTEGER NOT NULL DEFAULT 0,
  delivered_orders INTEGER NOT NULL DEFAULT 0,
  returned_orders INTEGER NOT NULL DEFAULT 0,
  refused_orders INTEGER NOT NULL DEFAULT 0,
  revenue NUMERIC NOT NULL DEFAULT 0.00,
  top_products JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT unique_seller_date UNIQUE (seller_id, report_date)
);

-- wilaya_risk_profiles
CREATE TABLE IF NOT EXISTS public.wilaya_risk_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
  wilaya TEXT NOT NULL,
  total_orders INTEGER NOT NULL DEFAULT 0,
  return_rate NUMERIC(5,4) NOT NULL DEFAULT 0,
  avg_delivery_days INTEGER NOT NULL DEFAULT 3,
  risk_multiplier NUMERIC(4,2) NOT NULL DEFAULT 1.00,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (seller_id, wilaya)
);

-- ============================================================
-- 3. FUNCTIONS & ROUTINES
-- ============================================================

-- update_updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- generate_order_number trigger function
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

-- generate_return_number trigger function
CREATE OR REPLACE FUNCTION public.generate_return_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.return_number IS NULL OR NEW.return_number = '' THEN
    NEW.return_number := 'RET-' || LPAD(nextval('public.return_number_seq')::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;

-- generate_seller_slug trigger function
CREATE OR REPLACE FUNCTION public.generate_seller_slug()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.slug IS NULL AND NEW.business_name IS NOT NULL THEN
    NEW.slug := lower(regexp_replace(NEW.business_name, '[^a-zA-Z0-9\u0600-\u06FF]+', '-', 'g'));
    NEW.slug := regexp_replace(NEW.slug, '^-+|-+$', '', 'g');
    -- Ensure uniqueness by appending random suffix if conflict
    IF EXISTS (SELECT 1 FROM public.sellers WHERE slug = NEW.slug AND id != NEW.id) THEN
      NEW.slug := NEW.slug || '-' || substr(md5(random()::text), 1, 6);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- increment_session_message_count trigger function
CREATE OR REPLACE FUNCTION public.increment_session_message_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  UPDATE public.ai_chat_sessions SET message_count = message_count + 1, updated_at = now() WHERE id = NEW.session_id;
  RETURN NEW;
END;
$$;

-- log_return_status_change trigger function
CREATE OR REPLACE FUNCTION public.log_return_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.return_notes (return_id, type, content, metadata)
    VALUES (NEW.id, 'status_change', 'Status changed from ' || OLD.status || ' to ' || NEW.status,
      jsonb_build_object('from', OLD.status, 'to', NEW.status));
  END IF;
  RETURN NEW;
END;
$$;

-- handle_new_user trigger function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Insert into sellers
  INSERT INTO public.sellers (id, email, full_name, business_name, phone)
  VALUES (
    NEW.id,
    NEW.email,
    NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
    NULLIF(NEW.raw_user_meta_data->>'business_name', ''),
    NULLIF(NEW.raw_user_meta_data->>'phone', '')
  );

  -- Insert into team_members as owner
  INSERT INTO public.team_members (seller_id, user_id, role, status, invited_by)
  VALUES (NEW.id, NEW.id, 'owner', 'active', NEW.id);

  -- Set custom app claim onboarding_completed = false
  UPDATE auth.users
  SET raw_app_meta_data =
    COALESCE(raw_app_meta_data, '{}') ||
    jsonb_build_object('onboarding_completed', false)
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$;

-- update_onboarding_claim trigger function
CREATE OR REPLACE FUNCTION public.update_onboarding_claim()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.onboarding_completed IS DISTINCT FROM OLD.onboarding_completed THEN
    UPDATE auth.users
    SET raw_app_meta_data =
      COALESCE(raw_app_meta_data, '{}') ||
      jsonb_build_object('onboarding_completed', NEW.onboarding_completed)
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

-- check_user_seller_access helper function
CREATE OR REPLACE FUNCTION public.check_user_seller_access(p_seller_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() = p_seller_id THEN
    RETURN TRUE;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.team_members
    WHERE seller_id = p_seller_id
      AND user_id = auth.uid()
      AND status = 'active'
  );
END;
$$;

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

-- get_pnl_summary RPC
CREATE OR REPLACE FUNCTION public.get_pnl_summary(p_period TEXT DEFAULT '30d')
RETURNS JSONB
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

-- get_product_profitability RPC
CREATE OR REPLACE FUNCTION public.get_product_profitability()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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
$$;

-- atomic_create_order RPC
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
    INSERT INTO public.customers (seller_id, name, phone, wilaya, commune, address)
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
      FROM public.products
      WHERE id = v_product_id AND seller_id = p_seller_id
      FOR UPDATE;

      IF v_current_stock IS NOT NULL AND v_current_stock < v_quantity THEN
        RAISE EXCEPTION 'Insufficient stock for product %. Available: %, Requested: %', v_product_id, v_current_stock, v_quantity;
      END IF;

      IF p_status = 'confirmed' AND v_current_stock IS NOT NULL THEN
        UPDATE public.products SET stock = stock - v_quantity, updated_at = now()
        WHERE id = v_product_id AND seller_id = p_seller_id;
      END IF;
    END IF;

    v_total_cost_of_goods := v_total_cost_of_goods + (v_quantity * COALESCE(v_cost_price, 0));
    v_enriched_item := v_item || jsonb_build_object('cost_price', v_cost_price);
    v_enriched_items := v_enriched_items || jsonb_build_object(v_enriched_item);
  END LOOP;

  v_net_profit := p_net_profit;
  IF v_net_profit IS NULL OR v_net_profit = 0 OR (p_total_price > 0 AND v_net_profit = p_total_price) THEN
    v_net_profit := p_total_price - v_total_cost_of_goods - p_delivery_cost;
  END IF;

  v_order_number := 'SF-' || upper(substring(to_char(now(), 'YYYYMMDDHH24MISS'), 1, 10)) || '-' || upper(substring(md5(random()::text), 1, 4));
  SELECT wilaya INTO v_seller_wilaya FROM public.sellers WHERE id = p_seller_id;

  INSERT INTO public.orders (
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

-- atomic_update_order_status RPC
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
  FROM public.orders WHERE id = p_order_id FOR UPDATE;
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
    SELECT row_to_json(public.orders.*) INTO v_result FROM public.orders WHERE id = p_order_id;
    RETURN v_result;
  END IF;

  IF p_new_status = 'confirmed' AND v_current_status != 'confirmed' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
    LOOP
      v_product_id := (v_item->>'product_id')::UUID;
      v_quantity := (v_item->>'quantity')::INT;
      IF v_product_id IS NOT NULL AND v_quantity IS NOT NULL THEN
        UPDATE public.products SET stock = GREATEST(0, stock - v_quantity)
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
        UPDATE public.products SET stock = stock + v_quantity
        WHERE id = v_product_id AND seller_id = v_seller_id;
      END IF;
    END LOOP;
  END IF;

  UPDATE public.orders SET
    status = p_new_status,
    confirmed_at = CASE WHEN p_new_status = 'confirmed' THEN now() ELSE confirmed_at END,
    shipped_at = CASE WHEN p_new_status = 'shipped' THEN now() ELSE shipped_at END,
    delivered_at = CASE WHEN p_new_status = 'delivered' THEN now() ELSE delivered_at END,
    updated_at = now()
  WHERE id = p_order_id;

  IF v_customer_id IS NOT NULL AND p_new_status = 'delivered' AND v_current_status != 'delivered' THEN
    UPDATE public.customers SET
      order_count = COALESCE(order_count, 0) + 1,
      total_spent = COALESCE(total_spent, 0) + COALESCE(v_total_price, 0)
    WHERE id = v_customer_id;
  END IF;

  SELECT row_to_json(public.orders.*) INTO v_result FROM public.orders WHERE id = p_order_id;
  RETURN v_result;
END;
$$;

-- ============================================================
-- 4. TRIGGERS
-- ============================================================
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS update_sellers_updated_at ON public.sellers;
CREATE TRIGGER update_sellers_updated_at
  BEFORE UPDATE ON public.sellers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS update_customers_updated_at ON public.customers;
CREATE TRIGGER update_customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS update_products_updated_at ON public.products;
CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS update_orders_updated_at ON public.orders;
CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS set_order_number ON public.orders;
CREATE TRIGGER set_order_number
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_order_number();

DROP TRIGGER IF EXISTS trigger_generate_seller_slug ON public.sellers;
CREATE TRIGGER trigger_generate_seller_slug
  BEFORE INSERT OR UPDATE OF business_name ON public.sellers
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_seller_slug();

DROP TRIGGER IF EXISTS update_ai_sessions_updated_at ON public.ai_chat_sessions;
CREATE TRIGGER update_ai_sessions_updated_at
  BEFORE UPDATE ON public.ai_chat_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS update_session_on_message ON public.ai_chat_messages;
CREATE TRIGGER update_session_on_message
  AFTER INSERT ON public.ai_chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.increment_session_message_count();

DROP TRIGGER IF EXISTS set_return_number ON public.returns;
CREATE TRIGGER set_return_number
  BEFORE INSERT ON public.returns
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_return_number();

DROP TRIGGER IF EXISTS update_returns_updated_at ON public.returns;
CREATE TRIGGER update_returns_updated_at
  BEFORE UPDATE ON public.returns
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS log_return_status ON public.returns;
CREATE TRIGGER log_return_status
  AFTER UPDATE ON public.returns
  FOR EACH ROW
  EXECUTE FUNCTION public.log_return_status_change();

DROP TRIGGER IF EXISTS update_expenses_updated_at ON public.expenses;
CREATE TRIGGER update_expenses_updated_at
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS update_team_members_updated_at ON public.team_members;
CREATE TRIGGER update_team_members_updated_at
  BEFORE UPDATE ON public.team_members
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS onboarding_claim_sync ON public.sellers;
CREATE TRIGGER onboarding_claim_sync
  AFTER UPDATE OF onboarding_completed ON public.sellers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_onboarding_claim();

-- ============================================================
-- 5. INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_categories_seller ON public.categories (seller_id);
CREATE INDEX IF NOT EXISTS idx_customers_seller ON public.customers (seller_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers (seller_id, phone);
CREATE INDEX IF NOT EXISTS idx_products_seller ON public.products (seller_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products (category_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_seller_name ON public.products (seller_id, name);
CREATE INDEX IF NOT EXISTS idx_orders_seller ON public.orders (seller_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders (seller_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_status_created ON public.orders (seller_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON public.orders (customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_external_id ON public.orders (external_id);
CREATE INDEX IF NOT EXISTS idx_orders_conversation_id ON public.orders (conversation_id) WHERE conversation_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_seller_external_id ON public.orders (seller_id, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_pending_by_phone ON public.orders (seller_id, created_at DESC) WHERE status = ANY (ARRAY['draft', 'pending']);
CREATE INDEX IF NOT EXISTS idx_deliveries_seller_id ON public.deliveries (seller_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_order ON public.deliveries (order_id);
CREATE INDEX IF NOT EXISTS idx_automations_seller ON public.automations (seller_id);
CREATE INDEX IF NOT EXISTS idx_automations_active ON public.automations (seller_id, active, trigger_type) WHERE active = true;
CREATE UNIQUE INDEX IF NOT EXISTS idx_automations_recipe_unique ON public.automations (seller_id, trigger_type, (trigger_config ->> 'recipe_id')) WHERE (trigger_config ->> 'recipe_id') IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_channels_seller ON public.channels (seller_id);
CREATE INDEX IF NOT EXISTS idx_conversations_seller ON public.conversations (seller_id);
CREATE INDEX IF NOT EXISTS idx_conversations_customer ON public.conversations (customer_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_channel_thread ON public.conversations (channel_id, platform_thread_id) WHERE platform_thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_pinned ON public.conversations (seller_id, last_message_at DESC) WHERE is_pinned = true;
CREATE INDEX IF NOT EXISTS idx_conversations_archived ON public.conversations (seller_id, is_archived, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON public.messages (conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON public.messages (created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_dedup ON public.messages (conversation_id, platform_message_id) WHERE platform_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_reply_to ON public.messages (reply_to_id) WHERE reply_to_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agent_activity_seller ON public.agent_activity (seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_seller ON public.whatsapp_templates (seller_id, category);
CREATE INDEX IF NOT EXISTS idx_retry_queue_status ON public.webhook_retry_queue (status, next_retry_at);
CREATE INDEX IF NOT EXISTS idx_retry_queue_pending ON public.webhook_retry_queue (status, next_retry_at) WHERE status = ANY (ARRAY['pending', 'processing']);
CREATE INDEX IF NOT EXISTS idx_retry_queue_seller_id ON public.webhook_retry_queue (seller_id) WHERE seller_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_retry_queue_claimed_by ON public.webhook_retry_queue (claimed_by) WHERE claimed_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_retry_queue_locked_until ON public.webhook_retry_queue (locked_until) WHERE locked_until IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_seller ON public.notifications (seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON public.notifications (seller_id, read) WHERE read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_active ON public.notifications (seller_id, dismissed, created_at DESC) WHERE dismissed = false;

-- Composite indexes from migration 021
CREATE INDEX IF NOT EXISTS idx_orders_seller_status_deleted ON public.orders (seller_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_orders_seller_created_at ON public.orders (seller_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_orders_seller_created_deleted ON public.orders (seller_id, created_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_products_seller_deleted ON public.products (seller_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_customers_seller_phone ON public.customers (seller_id, phone);
CREATE INDEX IF NOT EXISTS idx_notifications_seller_created ON public.notifications (seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_daily_reports_seller_date ON public.daily_analytics_reports (seller_id, report_date DESC);
CREATE INDEX IF NOT EXISTS idx_deliveries_provider_seller ON public.deliveries (provider, seller_id);
CREATE INDEX IF NOT EXISTS idx_channels_seller_type ON public.channels (seller_id, type);
CREATE INDEX IF NOT EXISTS idx_return_notes_author_id ON public.return_notes (author_id);
CREATE INDEX IF NOT EXISTS idx_returns_customer_id ON public.returns (customer_id);
CREATE INDEX IF NOT EXISTS idx_returns_exchange_order_id ON public.returns (exchange_order_id);
CREATE INDEX IF NOT EXISTS idx_team_members_invited_by ON public.team_members (invited_by);
CREATE INDEX IF NOT EXISTS idx_agent_activity_seller_id ON public.agent_activity (seller_id);
CREATE INDEX IF NOT EXISTS idx_expenses_seller_id ON public.expenses (seller_id);
CREATE INDEX IF NOT EXISTS idx_ai_messages_session_id ON public.ai_chat_messages (session_id);
CREATE INDEX IF NOT EXISTS idx_wilaya_risk_profiles_seller ON public.wilaya_risk_profiles (seller_id, wilaya);

-- ============================================================
-- 6. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================
ALTER TABLE public.sellers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_retry_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.return_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_analytics_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wilaya_risk_profiles ENABLE ROW LEVEL SECURITY;

-- sellers
CREATE POLICY "sellers_public_select" ON public.sellers FOR SELECT TO anon USING (form_enabled = true);
-- S1 fix: restrict anon to safe columns only (no webhook_token, email, settings, etc.)
REVOKE SELECT ON public.sellers FROM anon;
GRANT SELECT (id, business_name, slug, wilaya, form_config, default_locale, form_enabled, phone, shipping_rates) ON public.sellers TO anon;
CREATE POLICY "sellers_team_access" ON public.sellers FOR ALL TO public USING (public.check_user_seller_access(id));

-- team_members
CREATE POLICY "team_members_manage" ON public.team_members FOR ALL TO public USING (
  (auth.uid() = seller_id) OR
  (EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.seller_id = team_members.seller_id AND tm.user_id = (SELECT auth.uid()) AND tm.role = 'admin' AND tm.status = 'active'))
) WITH CHECK (
  (auth.uid() = seller_id) OR
  (EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.seller_id = team_members.seller_id AND tm.user_id = (SELECT auth.uid()) AND tm.role = 'admin' AND tm.status = 'active'))
);

-- S10 fix: allow team members to read their own row (needed for getUserSellerContext)
CREATE POLICY "team_members_self_select" ON public.team_members FOR SELECT TO public USING (auth.uid() = user_id);

-- categories
CREATE POLICY "categories_team_access" ON public.categories FOR ALL TO public USING (public.check_user_seller_access(seller_id)) WITH CHECK (public.check_user_seller_access(seller_id));

-- products
CREATE POLICY "products_public_select" ON public.products FOR SELECT TO anon USING (
  EXISTS (SELECT 1 FROM public.sellers s WHERE s.id = products.seller_id AND s.form_enabled = true) AND active = true AND stock > 0 AND deleted_at IS NULL
);
CREATE POLICY "products_team_access" ON public.products FOR ALL TO public USING (public.check_user_seller_access(seller_id)) WITH CHECK (public.check_user_seller_access(seller_id));

-- customers
CREATE POLICY "customers_team_access" ON public.customers FOR ALL TO public USING (public.check_user_seller_access(seller_id)) WITH CHECK (public.check_user_seller_access(seller_id));

-- channels
CREATE POLICY "channels_team_access" ON public.channels FOR ALL TO public USING (public.check_user_seller_access(seller_id)) WITH CHECK (public.check_user_seller_access(seller_id));

-- conversations
CREATE POLICY "conversations_team_access" ON public.conversations FOR ALL TO public USING (public.check_user_seller_access(seller_id)) WITH CHECK (public.check_user_seller_access(seller_id));

-- messages
CREATE POLICY "messages_team_access" ON public.messages FOR ALL TO public USING (
  EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND public.check_user_seller_access(c.seller_id))
);

-- orders
CREATE POLICY "orders_team_access" ON public.orders FOR ALL TO public USING (public.check_user_seller_access(seller_id)) WITH CHECK (public.check_user_seller_access(seller_id));

-- deliveries
CREATE POLICY "deliveries_team_access" ON public.deliveries FOR ALL TO public USING (public.check_user_seller_access(seller_id)) WITH CHECK (public.check_user_seller_access(seller_id));

-- automations
CREATE POLICY "automations_team_access" ON public.automations FOR ALL TO public USING (public.check_user_seller_access(seller_id)) WITH CHECK (public.check_user_seller_access(seller_id));

-- integrations
CREATE POLICY "integrations_team_access" ON public.integrations FOR ALL TO public USING (public.check_user_seller_access(seller_id)) WITH CHECK (public.check_user_seller_access(seller_id));

-- agent_activity
CREATE POLICY "agent_activity_all" ON public.agent_activity FOR ALL TO public USING (
  ((SELECT auth.uid()) = seller_id) OR public.check_user_seller_access(seller_id)
) WITH CHECK (
  ((SELECT auth.uid()) = seller_id) OR public.check_user_seller_access(seller_id)
);

-- whatsapp_templates
CREATE POLICY "whatsapp_templates_team_access" ON public.whatsapp_templates FOR ALL TO public USING (public.check_user_seller_access(seller_id)) WITH CHECK (public.check_user_seller_access(seller_id));

-- webhook_retry_queue
CREATE POLICY "webhook_retry_queue_team_access" ON public.webhook_retry_queue FOR ALL TO public USING (public.check_user_seller_access(seller_id)) WITH CHECK (public.check_user_seller_access(seller_id));

-- webhook_events
CREATE POLICY "webhook_events_service_all" ON public.webhook_events FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "webhook_events_team_access" ON public.webhook_events FOR SELECT TO public USING (public.check_user_seller_access(seller_id));

-- notifications
CREATE POLICY "notifications_team_access" ON public.notifications FOR ALL TO public USING (public.check_user_seller_access(seller_id)) WITH CHECK (public.check_user_seller_access(seller_id));

-- import_batches
CREATE POLICY "import_batches_team_access" ON public.import_batches FOR ALL TO public USING (public.check_user_seller_access(seller_id)) WITH CHECK (public.check_user_seller_access(seller_id));

-- ai_chat_sessions
CREATE POLICY "ai_chat_sessions_access" ON public.ai_chat_sessions FOR ALL TO public USING (
  ((SELECT auth.uid()) = seller_id) OR public.check_user_seller_access(seller_id)
) WITH CHECK (
  ((SELECT auth.uid()) = seller_id) OR public.check_user_seller_access(seller_id)
);

-- ai_chat_messages
CREATE POLICY "ai_chat_messages_access" ON public.ai_chat_messages FOR ALL TO public USING (
  EXISTS (SELECT 1 FROM public.ai_chat_sessions s WHERE s.id = ai_chat_messages.session_id AND (((SELECT auth.uid()) = s.seller_id) OR public.check_user_seller_access(s.seller_id)))
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.ai_chat_sessions s WHERE s.id = ai_chat_messages.session_id AND (((SELECT auth.uid()) = s.seller_id) OR public.check_user_seller_access(s.seller_id)))
);

-- returns
CREATE POLICY "returns_team_access" ON public.returns FOR ALL TO public USING (public.check_user_seller_access(seller_id)) WITH CHECK (public.check_user_seller_access(seller_id));

-- return_notes
CREATE POLICY "return_notes_team_access" ON public.return_notes FOR ALL TO public USING (
  EXISTS (SELECT 1 FROM public.returns r WHERE r.id = return_id AND public.check_user_seller_access(r.seller_id))
);

-- expenses
CREATE POLICY "expenses_team_access" ON public.expenses FOR ALL TO public USING (public.check_user_seller_access(seller_id)) WITH CHECK (public.check_user_seller_access(seller_id));

-- daily_analytics_reports
CREATE POLICY "service_role_all" ON public.daily_analytics_reports FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "view_own_reports" ON public.daily_analytics_reports FOR SELECT TO authenticated USING (public.check_user_seller_access(seller_id));

-- wilaya_risk_profiles
CREATE POLICY "Sellers can read own wilaya risk profiles" ON public.wilaya_risk_profiles FOR SELECT TO public USING (seller_id = (SELECT auth.uid()));
CREATE POLICY "Service role can manage wilaya risk profiles" ON public.wilaya_risk_profiles FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- 7. SECURITY & GRANTS
-- ============================================================

-- Revoke EXECUTE from authenticated/anon/public on sensitive definer routines
REVOKE ALL ON FUNCTION public.get_dashboard_aggregates(UUID) FROM authenticated, anon, public;
REVOKE ALL ON FUNCTION public.get_analytics_data(TEXT, UUID) FROM authenticated, anon, public;
REVOKE ALL ON FUNCTION public.get_pnl_summary(TEXT) FROM authenticated, anon, public;
REVOKE ALL ON FUNCTION public.get_product_profitability() FROM authenticated, anon, public;
REVOKE ALL ON FUNCTION public.check_user_seller_access(UUID) FROM authenticated, anon, public;
REVOKE ALL ON FUNCTION public.atomic_create_order(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,JSONB,NUMERIC,NUMERIC,NUMERIC,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) FROM authenticated, anon, public;
REVOKE ALL ON FUNCTION public.atomic_update_order_status(UUID, TEXT) FROM authenticated, anon, public;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM authenticated, anon, public;

-- Grant EXECUTE to proper roles
GRANT EXECUTE ON FUNCTION public.get_dashboard_aggregates(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_analytics_data(TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_pnl_summary(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_product_profitability() TO service_role;
GRANT EXECUTE ON FUNCTION public.check_user_seller_access(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.atomic_create_order(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,JSONB,NUMERIC,NUMERIC,NUMERIC,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.atomic_update_order_status(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO authenticated; -- needed by trigger path
