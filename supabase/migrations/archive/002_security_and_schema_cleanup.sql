-- 002_security_and_schema_cleanup.sql
-- Security: revoke authenticated from SECURITY DEFINER RPCs
-- Schema: ensure deleted_at columns, fix CHECK constraints, fix RLS initplan

-- ============================================================
-- 1. SCHEMA ALIGNMENT — ensure deleted_at soft-delete columns
-- ============================================================

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- ============================================================
-- 2. FIX deliveries provider CHECK — add maystro
-- ============================================================

-- Drop old CHECK and re-add with maystro included (icom removed in 003)
ALTER TABLE public.deliveries DROP CONSTRAINT IF EXISTS deliveries_provider_check;
ALTER TABLE public.deliveries ADD CONSTRAINT deliveries_provider_check
  CHECK (provider IN ('yalidine', 'zrexpress', 'maystro', 'manual'));

-- ============================================================
-- 3. FIX RLS initplan performance on notifications
-- ============================================================

DROP POLICY IF EXISTS "notifications_seller_select" ON public.notifications;
DROP POLICY IF EXISTS "notifications_seller_insert" ON public.notifications;
DROP POLICY IF EXISTS "notifications_seller_update" ON public.notifications;
DROP POLICY IF EXISTS "notifications_seller_delete" ON public.notifications;

CREATE POLICY "notifications_seller_select" ON public.notifications FOR SELECT
  USING ((select auth.uid()) = seller_id);
CREATE POLICY "notifications_seller_insert" ON public.notifications FOR INSERT
  WITH CHECK ((select auth.uid()) = seller_id);
CREATE POLICY "notifications_seller_update" ON public.notifications FOR UPDATE
  USING ((select auth.uid()) = seller_id);
CREATE POLICY "notifications_seller_delete" ON public.notifications FOR DELETE
  USING ((select auth.uid()) = seller_id);

-- ============================================================
-- 4. SECURITY DEFINER RPC LOCKDOWN
-- Revoke from authenticated + anon; grant only to service_role
-- ============================================================

REVOKE ALL ON FUNCTION public.get_dashboard_aggregates() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_analytics_data(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.atomic_create_order(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,JSONB,NUMERIC,NUMERIC,NUMERIC,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.atomic_update_order_status(UUID,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_dashboard_aggregates() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_analytics_data(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.atomic_create_order(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,JSONB,NUMERIC,NUMERIC,NUMERIC,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.atomic_update_order_status(UUID,TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
