-- ================================================
-- SahelFlow Core Database Schema
-- Run this in your Supabase SQL Editor
-- ================================================

-- 1. Sellers (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.sellers (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  business_name TEXT,
  phone TEXT,
  plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'starter', 'pro', 'enterprise')),
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Channels (messaging platforms connected by seller)
CREATE TABLE IF NOT EXISTS public.channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('whatsapp', 'messenger', 'instagram')),
  name TEXT,
  credentials JSONB DEFAULT '{}',
  active BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Customers
CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
  name TEXT,
  phone TEXT,
  wilaya TEXT,
  commune TEXT,
  address TEXT,
  order_count INT DEFAULT 0,
  total_spent NUMERIC(12,2) DEFAULT 0,
  risk_score NUMERIC(5,2) DEFAULT 0,
  is_blocked BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Conversations
CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
  channel_id UUID REFERENCES public.channels(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  platform_thread_id TEXT,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'closed', 'archived')),
  unread_count INT DEFAULT 0,
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Messages
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  content TEXT,
  content_type TEXT DEFAULT 'text' CHECK (content_type IN ('text', 'image', 'audio', 'video', 'file')),
  media_url TEXT,
  ai_extraction JSONB,
  is_ai_reply BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Products
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sku TEXT,
  description TEXT,
  variants JSONB DEFAULT '[]',
  stock INT DEFAULT 0,
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  cost_price NUMERIC(12,2) DEFAULT 0,
  image_url TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Orders
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  order_number TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'shipped', 'delivered', 'returned', 'refused', 'cancelled')),
  items JSONB DEFAULT '[]',
  total_price NUMERIC(12,2) DEFAULT 0,
  delivery_cost NUMERIC(12,2) DEFAULT 0,
  net_profit NUMERIC(12,2) DEFAULT 0,
  wilaya TEXT,
  commune TEXT,
  address TEXT,
  tracking_id TEXT,
  delivery_company TEXT,
  risk_score NUMERIC(5,2) DEFAULT 0,
  notes TEXT,
  confirmed_at TIMESTAMPTZ,
  shipped_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Deliveries
CREATE TABLE IF NOT EXISTS public.deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('yalidine', 'zr_express', 'maystro', 'manual')),
  tracking_number TEXT,
  status TEXT DEFAULT 'created' CHECK (status IN ('created', 'picked_up', 'in_transit', 'delivered', 'returned', 'failed')),
  raw_response JSONB DEFAULT '{}',
  last_sync TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Automations
CREATE TABLE IF NOT EXISTS public.automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT CHECK (trigger_type IN ('message_received', 'order_status_change', 'risk_threshold', 'schedule', 'manual')),
  trigger_config JSONB DEFAULT '{}',
  action_type TEXT CHECK (action_type IN ('send_reply', 'create_order', 'assign_tag', 'notify', 'update_status')),
  action_config JSONB DEFAULT '{}',
  active BOOLEAN DEFAULT false,
  run_count INT DEFAULT 0,
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================
-- INDEXES for performance
-- ================================================

CREATE INDEX IF NOT EXISTS idx_channels_seller ON public.channels(seller_id);
CREATE INDEX IF NOT EXISTS idx_customers_seller ON public.customers(seller_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers(seller_id, phone);
CREATE INDEX IF NOT EXISTS idx_conversations_seller ON public.conversations(seller_id);
CREATE INDEX IF NOT EXISTS idx_conversations_customer ON public.conversations(customer_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON public.messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON public.messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_seller ON public.products(seller_id);
CREATE INDEX IF NOT EXISTS idx_orders_seller ON public.orders(seller_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON public.orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(seller_id, status);
CREATE INDEX IF NOT EXISTS idx_deliveries_order ON public.deliveries(order_id);
CREATE INDEX IF NOT EXISTS idx_automations_seller ON public.automations(seller_id);

-- ================================================
-- ROW LEVEL SECURITY (RLS)
-- Each seller can only see their own data
-- ================================================

ALTER TABLE public.sellers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;

-- Sellers: users can only access their own row
CREATE POLICY "sellers_own_data" ON public.sellers
  FOR ALL USING (auth.uid() = id);

-- Channels: sellers see only their channels
CREATE POLICY "channels_seller_only" ON public.channels
  FOR ALL USING (seller_id = auth.uid());

-- Customers: sellers see only their customers
CREATE POLICY "customers_seller_only" ON public.customers
  FOR ALL USING (seller_id = auth.uid());

-- Conversations: sellers see only their conversations
CREATE POLICY "conversations_seller_only" ON public.conversations
  FOR ALL USING (seller_id = auth.uid());

-- Messages: sellers see messages from their conversations
CREATE POLICY "messages_seller_only" ON public.messages
  FOR ALL USING (
    conversation_id IN (
      SELECT id FROM public.conversations WHERE seller_id = auth.uid()
    )
  );

-- Products: sellers see only their products
CREATE POLICY "products_seller_only" ON public.products
  FOR ALL USING (seller_id = auth.uid());

-- Orders: sellers see only their orders
CREATE POLICY "orders_seller_only" ON public.orders
  FOR ALL USING (seller_id = auth.uid());

-- Deliveries: sellers see only their deliveries
CREATE POLICY "deliveries_seller_only" ON public.deliveries
  FOR ALL USING (seller_id = auth.uid());

-- Automations: sellers see only their automations
CREATE POLICY "automations_seller_only" ON public.automations
  FOR ALL USING (seller_id = auth.uid());

-- ================================================
-- TRIGGER: Auto-create seller profile on signup
-- ================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists, then create
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ================================================
-- TRIGGER: Auto-generate order numbers
-- ================================================

CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.order_number IS NULL THEN
    NEW.order_number := 'SF-' || TO_CHAR(NOW(), 'YYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_order_number ON public.orders;
CREATE TRIGGER set_order_number
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.generate_order_number();

-- ================================================
-- TRIGGER: Auto-update updated_at timestamps
-- ================================================

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_sellers_updated_at ON public.sellers;
CREATE TRIGGER update_sellers_updated_at
  BEFORE UPDATE ON public.sellers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS update_customers_updated_at ON public.customers;
CREATE TRIGGER update_customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS update_products_updated_at ON public.products;
CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS update_orders_updated_at ON public.orders;
CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
