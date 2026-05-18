-- ============================================================
-- SahelFlow Migration 027: RLS InitPlan Performance Fix
-- ============================================================
-- Replace bare auth.uid() with (select auth.uid()) on every table.
--
-- Why this matters:
-- When auth.uid() appears directly in a USING/WITH CHECK clause,
-- PostgreSQL re-evaluates the function for EVERY ROW scanned.
-- Wrapping it in (select auth.uid()) turns it into an InitPlan —
-- evaluated ONCE per query and reused as a constant. On tables
-- with hundreds of orders/messages/products, this is the difference
-- between a fast index scan and a full sequential scan.
--
-- Flagged by Supabase security/performance advisor on 12+ tables.
-- All policies below are DROP + CREATE (exact same logic, just fixed).
-- ============================================================

-- ── agent_activity ──
DROP POLICY IF EXISTS "Sellers see own activity" ON public.agent_activity;
CREATE POLICY "Sellers see own activity"
  ON public.agent_activity FOR SELECT
  USING ((select auth.uid()) = seller_id);

DROP POLICY IF EXISTS "System inserts activity" ON public.agent_activity;
CREATE POLICY "System inserts activity"
  ON public.agent_activity FOR INSERT
  WITH CHECK ((select auth.uid()) = seller_id);

-- ── automations ──
DROP POLICY IF EXISTS "automations_seller_only" ON public.automations;
CREATE POLICY "automations_seller_only"
  ON public.automations FOR ALL
  USING ((select auth.uid()) = seller_id);

-- ── categories ──
-- Fix: the two permissive SELECT policies (categories_public_read + categories_seller_only
-- FOR ALL) caused a "multiple permissive policies" warning. Replaced with:
--   - One SELECT policy (public read — true for all)
--   - Separate INSERT / UPDATE / DELETE policies scoped to the seller
DROP POLICY IF EXISTS "categories_public_read"  ON public.categories;
DROP POLICY IF EXISTS "categories_seller_only"  ON public.categories;

CREATE POLICY "categories_public_read"
  ON public.categories FOR SELECT
  USING (true);

CREATE POLICY "categories_seller_write"
  ON public.categories FOR INSERT
  WITH CHECK ((select auth.uid()) = seller_id);

CREATE POLICY "categories_seller_update"
  ON public.categories FOR UPDATE
  USING ((select auth.uid()) = seller_id);

CREATE POLICY "categories_seller_delete"
  ON public.categories FOR DELETE
  USING ((select auth.uid()) = seller_id);

-- ── channels ──
DROP POLICY IF EXISTS "channels_seller_only" ON public.channels;
CREATE POLICY "channels_seller_only"
  ON public.channels FOR ALL
  USING ((select auth.uid()) = seller_id);

-- ── conversations ──
DROP POLICY IF EXISTS "conversations_seller_only" ON public.conversations;
CREATE POLICY "conversations_seller_only"
  ON public.conversations FOR ALL
  USING ((select auth.uid()) = seller_id);

-- ── customers ──
-- public_insert_customers is intentionally kept for storefront COD checkout.
-- Only the seller-scoped policy is rebuilt here.
DROP POLICY IF EXISTS "customers_seller_only" ON public.customers;
CREATE POLICY "customers_seller_only"
  ON public.customers FOR ALL
  USING ((select auth.uid()) = seller_id);

-- ── deliveries ──
DROP POLICY IF EXISTS "deliveries_seller_only" ON public.deliveries;
CREATE POLICY "deliveries_seller_only"
  ON public.deliveries FOR ALL
  USING ((select auth.uid()) = seller_id);

-- ── integrations ──
DROP POLICY IF EXISTS "Sellers manage own integrations" ON public.integrations;
CREATE POLICY "Sellers manage own integrations"
  ON public.integrations FOR ALL
  USING ((select auth.uid()) = seller_id);

-- ── messages ──
-- Special case: messages has no seller_id column.
-- Security is enforced by joining through conversations.seller_id.
-- The (select auth.uid()) wrapper applies inside the subquery WHERE clause.
DROP POLICY IF EXISTS "messages_seller_only" ON public.messages;
CREATE POLICY "messages_seller_only"
  ON public.messages FOR ALL
  USING (
    conversation_id IN (
      SELECT id
      FROM public.conversations
      WHERE seller_id = (select auth.uid())
    )
  );

-- ── orders ──
-- public_insert_orders is intentionally kept for storefront COD checkout.
-- Only the seller-scoped policy is rebuilt here.
DROP POLICY IF EXISTS "orders_seller_only" ON public.orders;
CREATE POLICY "orders_seller_only"
  ON public.orders FOR ALL
  USING ((select auth.uid()) = seller_id);

-- ── products ──
-- Fix: the two permissive SELECT policies (public_read_products + products_seller_only
-- FOR ALL) caused a "multiple permissive policies" warning. Replaced with:
--   - One SELECT policy combining public active view + seller full view
--   - Separate INSERT / UPDATE / DELETE policies scoped to the seller
DROP POLICY IF EXISTS "public_read_products"  ON public.products;
DROP POLICY IF EXISTS "products_seller_only"  ON public.products;

CREATE POLICY "products_public_read"
  ON public.products FOR SELECT
  USING (
    active = true
    OR (select auth.uid()) = seller_id
  );

CREATE POLICY "products_seller_write"
  ON public.products FOR INSERT
  WITH CHECK ((select auth.uid()) = seller_id);

CREATE POLICY "products_seller_update"
  ON public.products FOR UPDATE
  USING ((select auth.uid()) = seller_id);

CREATE POLICY "products_seller_delete"
  ON public.products FOR DELETE
  USING ((select auth.uid()) = seller_id);

-- ── sellers ──
-- Fix: the two permissive SELECT policies (public_read_sellers + sellers_own_data
-- FOR ALL) caused a "multiple permissive policies" warning. Replaced with:
--   - One SELECT policy (public read — storefront needs seller branding without auth)
--   - One UPDATE policy scoped to the owning seller
--   - No INSERT policy needed: the handle_new_user trigger (SECURITY DEFINER)
--     inserts the seller row and bypasses RLS entirely.
DROP POLICY IF EXISTS "public_read_sellers" ON public.sellers;
DROP POLICY IF EXISTS "sellers_own_data"    ON public.sellers;

CREATE POLICY "sellers_public_read"
  ON public.sellers FOR SELECT
  USING (true);

CREATE POLICY "sellers_own_write"
  ON public.sellers FOR UPDATE
  USING ((select auth.uid()) = id);

-- ── whatsapp_templates ──
DROP POLICY IF EXISTS "Sellers can view own templates"   ON public.whatsapp_templates;
DROP POLICY IF EXISTS "Sellers can insert own templates" ON public.whatsapp_templates;
DROP POLICY IF EXISTS "Sellers can update own templates" ON public.whatsapp_templates;
DROP POLICY IF EXISTS "Sellers can delete own templates" ON public.whatsapp_templates;

CREATE POLICY "Sellers can view own templates"
  ON public.whatsapp_templates FOR SELECT
  USING ((select auth.uid()) = seller_id);

CREATE POLICY "Sellers can insert own templates"
  ON public.whatsapp_templates FOR INSERT
  WITH CHECK ((select auth.uid()) = seller_id);

CREATE POLICY "Sellers can update own templates"
  ON public.whatsapp_templates FOR UPDATE
  USING ((select auth.uid()) = seller_id);

CREATE POLICY "Sellers can delete own templates"
  ON public.whatsapp_templates FOR DELETE
  USING ((select auth.uid()) = seller_id);
