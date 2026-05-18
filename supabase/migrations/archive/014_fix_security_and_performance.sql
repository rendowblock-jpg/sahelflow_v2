-- SahelFlow Migration 014: Security & Performance fixes

-- 1. Secure mutable functions by wiping search_path
-- This prevents search_path injection attacks during function execution
ALTER FUNCTION public.generate_order_number() SET search_path = '';
ALTER FUNCTION public.handle_new_user() SET search_path = '';
ALTER FUNCTION public.update_updated_at() SET search_path = '';

-- 2. Performance: Add missing covering indexes for foreign keys
CREATE INDEX IF NOT EXISTS idx_conversations_channel ON conversations(channel_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_seller ON deliveries(seller_id);
CREATE INDEX IF NOT EXISTS idx_orders_conversation ON orders(conversation_id);

-- 3. Performance: Fix `InitPlan` on RLS policies
-- Replace `auth.uid()` with `(select auth.uid())` which avoids running the
-- function sequentially for every single row scanned, turning it into an InitPlan parameter.

-- Sellers
DROP POLICY IF EXISTS "Sellers can view own data" ON sellers;
CREATE POLICY "Sellers can view own data" ON sellers FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Sellers can update own data" ON sellers;
CREATE POLICY "Sellers can update own data" ON sellers FOR UPDATE USING (auth.uid() = id);

-- Storefronts
DROP POLICY IF EXISTS "Sellers can manage storefronts" ON storefronts;
CREATE POLICY "Sellers can manage storefronts" ON storefronts FOR ALL USING ((select auth.uid()) = seller_id);

-- Categories
DROP POLICY IF EXISTS "Sellers can manage categories" ON categories;
CREATE POLICY "Sellers can manage categories" ON categories FOR ALL USING ((select auth.uid()) = seller_id);

-- Products
DROP POLICY IF EXISTS "Sellers can manage products" ON products;
CREATE POLICY "Sellers can manage products" ON products FOR ALL USING ((select auth.uid()) = seller_id);

-- Customers
DROP POLICY IF EXISTS "Sellers can manage customers" ON customers;
CREATE POLICY "Sellers can manage customers" ON customers FOR ALL USING ((select auth.uid()) = seller_id);

-- Orders
DROP POLICY IF EXISTS "Sellers can manage orders" ON orders;
CREATE POLICY "Sellers can manage orders" ON orders FOR ALL USING ((select auth.uid()) = seller_id);

-- Deliveries
DROP POLICY IF EXISTS "Sellers can manage deliveries" ON deliveries;
CREATE POLICY "Sellers can manage deliveries" ON deliveries FOR ALL USING ((select auth.uid()) = seller_id);

-- Integrations
DROP POLICY IF EXISTS "Sellers can manage integrations" ON integrations;
CREATE POLICY "Sellers can manage integrations" ON integrations FOR ALL USING ((select auth.uid()) = seller_id);

-- Channels
DROP POLICY IF EXISTS "Sellers can manage channels" ON channels;
CREATE POLICY "Sellers can manage channels" ON channels FOR ALL USING ((select auth.uid()) = seller_id);

-- Conversations
DROP POLICY IF EXISTS "Sellers can manage conversations" ON conversations;
CREATE POLICY "Sellers can manage conversations" ON conversations FOR ALL USING ((select auth.uid()) = seller_id);

-- Messages
DROP POLICY IF EXISTS "Sellers can manage messages" ON messages;
CREATE POLICY "Sellers can manage messages" ON messages FOR ALL USING ((select auth.uid()) = seller_id);

-- Automations
DROP POLICY IF EXISTS "Sellers can manage automations" ON automations;
CREATE POLICY "Sellers can manage automations" ON automations FOR ALL USING ((select auth.uid()) = seller_id);

-- Agent Activity
DROP POLICY IF EXISTS "Sellers can view agent activity" ON agent_activity;
CREATE POLICY "Sellers can view agent activity" ON agent_activity FOR SELECT USING ((select auth.uid()) = seller_id);
