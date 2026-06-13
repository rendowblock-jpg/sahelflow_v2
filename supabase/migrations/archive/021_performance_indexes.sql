-- ============================================================
-- SahelFlow v2 — Phase 5: Performance & Scalability
-- Migration 021: Composite indexes, FK indexes, drop unused
-- ============================================================

-- ─── 5.5: Composite indexes for dashboard/analytics query patterns ───

-- Orders: dashboard filters by seller_id + status, with soft-delete exclusion
CREATE INDEX IF NOT EXISTS idx_orders_seller_status_deleted
  ON orders (seller_id, status) WHERE deleted_at IS NULL;

-- Orders: analytics time-series by seller_id + created_at
CREATE INDEX IF NOT EXISTS idx_orders_seller_created_at
  ON orders (seller_id, created_at DESC) WHERE deleted_at IS NULL;

-- Orders: daily-report cron filters by seller_id + created_at range
-- (covers the daily-report WHERE clause exactly)
CREATE INDEX IF NOT EXISTS idx_orders_seller_created_deleted
  ON orders (seller_id, created_at) WHERE deleted_at IS NULL;

-- Products: listing page filters by seller_id, excludes soft-deleted
CREATE INDEX IF NOT EXISTS idx_products_seller_deleted
  ON products (seller_id) WHERE deleted_at IS NULL;

-- Customers: lookup by seller_id + phone (dedup check)
CREATE INDEX IF NOT EXISTS idx_customers_seller_phone
  ON customers (seller_id, phone);

-- Notifications: seller inbox ordered by created_at
CREATE INDEX IF NOT EXISTS idx_notifications_seller_created
  ON notifications (seller_id, created_at DESC);

-- Daily analytics reports: upsert conflict target + lookup
CREATE INDEX IF NOT EXISTS idx_daily_reports_seller_date
  ON daily_analytics_reports (seller_id, report_date DESC);

-- Deliveries: tracking sync groups by (provider, seller_id)
CREATE INDEX IF NOT EXISTS idx_deliveries_provider_seller
  ON deliveries (provider, seller_id);

-- Channels: lookup by seller_id + type (used in daily-report)
CREATE INDEX IF NOT EXISTS idx_channels_seller_type
  ON channels (seller_id, type);


-- ─── 5.6: Missing FK indexes ───

-- return_notes.author_id → sellers.id (used in JOIN when fetching notes)
CREATE INDEX IF NOT EXISTS idx_return_notes_author_id
  ON return_notes (author_id);

-- returns.customer_id → customers.id (used in customer return history)
CREATE INDEX IF NOT EXISTS idx_returns_customer_id
  ON returns (customer_id);

-- returns.exchange_order_id → orders.id (used to link returns to exchange orders)
CREATE INDEX IF NOT EXISTS idx_returns_exchange_order_id
  ON returns (exchange_order_id);

-- team_members.invited_by → sellers.id (used in team management queries)
CREATE INDEX IF NOT EXISTS idx_team_members_invited_by
  ON team_members (invited_by);

-- agent_activity.seller_id → sellers.id (used in every agent query)
CREATE INDEX IF NOT EXISTS idx_agent_activity_seller_id
  ON agent_activity (seller_id);

-- expenses.seller_id → sellers.id (used in accounting queries)
CREATE INDEX IF NOT EXISTS idx_expenses_seller_id
  ON expenses (seller_id);

-- ai_chat_messages.session_id → ai_chat_sessions.id (used in message listing)
CREATE INDEX IF NOT EXISTS idx_ai_messages_session_id
  ON ai_chat_messages (session_id);


-- ─── 5.7: Drop unused indexes ───
-- Old single-column indexes now covered by composites above:
DROP INDEX IF EXISTS idx_orders_created_at;  -- covered by idx_orders_seller_created_at
DROP INDEX IF EXISTS idx_products_created_at;  -- rarely used without seller_id
DROP INDEX IF EXISTS idx_customers_created_at;  -- rarely used without seller_id

-- ─── 5.8: Materialized wilaya_risk_profiles table ───
CREATE TABLE IF NOT EXISTS wilaya_risk_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  wilaya TEXT NOT NULL,
  total_orders INTEGER NOT NULL DEFAULT 0,
  return_rate NUMERIC(5,4) NOT NULL DEFAULT 0,  -- 0.0000 to 1.0000
  avg_delivery_days INTEGER NOT NULL DEFAULT 3,
  risk_multiplier NUMERIC(4,2) NOT NULL DEFAULT 1.00,  -- 0.50 to 2.00
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (seller_id, wilaya)
);

-- Index for risk-engine lookups
CREATE INDEX IF NOT EXISTS idx_wilaya_risk_profiles_seller
  ON wilaya_risk_profiles (seller_id, wilaya);

-- RLS
ALTER TABLE wilaya_risk_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sellers can read own wilaya risk profiles"
  ON wilaya_risk_profiles FOR SELECT
  USING (seller_id = (SELECT auth.uid()));

-- Only service_role can INSERT/UPDATE (written by cron/admin)
CREATE POLICY "Service role can manage wilaya risk profiles"
  ON wilaya_risk_profiles FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');


-- ─── 5.4: Onboarding claim stored in JWT ───
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Insert into sellers table
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

  -- Set custom claims: onboarding_completed = false for new users
  UPDATE auth.users
  SET raw_app_meta_data =
    COALESCE(raw_app_meta_data, '{}') ||
    jsonb_build_object('onboarding_completed', false)
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$;

-- Backfill: set onboarding_completed claim for all existing users
DO $$
DECLARE
  seller RECORD;
BEGIN
  FOR seller IN SELECT id, onboarding_completed FROM public.sellers LOOP
    UPDATE auth.users
    SET raw_app_meta_data =
      COALESCE(raw_app_meta_data, '{}') ||
      jsonb_build_object('onboarding_completed', seller.onboarding_completed)
    WHERE id = seller.id;
  END LOOP;
END;
$$;

-- Function to update the claim when onboarding status changes
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

-- Trigger on sellers table to auto-update the claim
DROP TRIGGER IF EXISTS onboarding_claim_sync ON public.sellers;
CREATE TRIGGER onboarding_claim_sync
  AFTER UPDATE OF onboarding_completed ON public.sellers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_onboarding_claim();
