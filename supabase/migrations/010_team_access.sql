-- ============================================================
-- Migration 010: Multi-User Access & Roles (Team Access)
-- ============================================================

-- Create public.team_members table
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

-- Unique index to prevent duplicate team entries per seller (case-insensitive email)
CREATE UNIQUE INDEX IF NOT EXISTS idx_team_seller_email ON public.team_members (seller_id, lower(email));
CREATE INDEX IF NOT EXISTS idx_team_members_user ON public.team_members (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_team_members_seller ON public.team_members (seller_id);

-- Trigger to auto-update updated_at timestamp
CREATE TRIGGER update_team_members_updated_at
  BEFORE UPDATE ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Enable RLS on team_members
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- SECURITY DEFINER ACCESS CHECK FUNCTION
-- ------------------------------------------------------------
-- Runs with bypass-RLS context to avoid recursive RLS check loops.
CREATE OR REPLACE FUNCTION public.check_user_seller_access(p_seller_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- 1. Check if the authenticated user is the owner of the seller profile
  IF auth.uid() = p_seller_id THEN
    RETURN TRUE;
  END IF;

  -- 2. Check if the authenticated user is an active team member of the seller
  RETURN EXISTS (
    SELECT 1 FROM public.team_members
    WHERE seller_id = p_seller_id
      AND user_id = auth.uid()
      AND status = 'active'
  );
END;
$$;

-- Grant execution to authenticated and service_role
REVOKE ALL ON FUNCTION public.check_user_seller_access(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_user_seller_access(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.check_user_seller_access(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_user_seller_access(UUID) TO service_role;

-- ------------------------------------------------------------
-- RLS POLICIES FOR team_members TABLE
-- ------------------------------------------------------------
CREATE POLICY "team_members_select" ON public.team_members
  FOR SELECT
  USING (public.check_user_seller_access(seller_id));

CREATE POLICY "team_members_manage" ON public.team_members
  FOR ALL
  USING (
    auth.uid() = seller_id OR 
    EXISTS (
      SELECT 1 FROM public.team_members
      WHERE seller_id = team_members.seller_id
        AND user_id = auth.uid()
        AND role = 'admin'
        AND status = 'active'
    )
  );

-- ------------------------------------------------------------
-- DROP OLD SINGLE-USER RLS POLICIES
-- ------------------------------------------------------------
-- sellers
DROP POLICY IF EXISTS "sellers_own_data" ON public.sellers;

-- customers
DROP POLICY IF EXISTS "customers_seller_only" ON public.customers;

-- products
DROP POLICY IF EXISTS "products_seller_write" ON public.products;
DROP POLICY IF EXISTS "products_seller_update" ON public.products;
DROP POLICY IF EXISTS "products_seller_delete" ON public.products;
DROP POLICY IF EXISTS "products_seller_select" ON public.products;

-- orders
DROP POLICY IF EXISTS "orders_seller_only" ON public.orders;

-- deliveries
DROP POLICY IF EXISTS "deliveries_seller_only" ON public.deliveries;

-- automations
DROP POLICY IF EXISTS "automations_seller_only" ON public.automations;

-- channels
DROP POLICY IF EXISTS "channels_seller_only" ON public.channels;

-- conversations
DROP POLICY IF EXISTS "conversations_seller_only" ON public.conversations;

-- messages
DROP POLICY IF EXISTS "messages_seller_only" ON public.messages;

-- integrations
DROP POLICY IF EXISTS "Sellers manage own integrations" ON public.integrations;

-- agent_activity
DROP POLICY IF EXISTS "Sellers see own activity" ON public.agent_activity;

-- whatsapp_templates
DROP POLICY IF EXISTS "Sellers can view own templates" ON public.whatsapp_templates;
DROP POLICY IF EXISTS "Sellers can insert own templates" ON public.whatsapp_templates;
DROP POLICY IF EXISTS "Sellers can update own templates" ON public.whatsapp_templates;
DROP POLICY IF EXISTS "Sellers can delete own templates" ON public.whatsapp_templates;

-- webhook_retry_queue
DROP POLICY IF EXISTS "Sellers can view own retry events" ON public.webhook_retry_queue;

-- categories
DROP POLICY IF EXISTS "categories_seller_write" ON public.categories;
DROP POLICY IF EXISTS "categories_seller_update" ON public.categories;
DROP POLICY IF EXISTS "categories_seller_delete" ON public.categories;
DROP POLICY IF EXISTS "categories_seller_select" ON public.categories;

-- notifications
DROP POLICY IF EXISTS "notifications_seller_select" ON public.notifications;
DROP POLICY IF EXISTS "notifications_seller_insert" ON public.notifications;
DROP POLICY IF EXISTS "notifications_seller_update" ON public.notifications;
DROP POLICY IF EXISTS "notifications_seller_delete" ON public.notifications;

-- webhook_events
DROP POLICY IF EXISTS "webhook_events_seller_select" ON public.webhook_events;

-- import_batches
DROP POLICY IF EXISTS "import_batches_seller_select" ON public.import_batches;
DROP POLICY IF EXISTS "import_batches_seller_insert" ON public.import_batches;
DROP POLICY IF EXISTS "import_batches_seller_update" ON public.import_batches;

-- ai_chat_sessions
DROP POLICY IF EXISTS "ai_chat_sessions_seller" ON public.ai_chat_sessions;

-- ai_chat_messages
DROP POLICY IF EXISTS "ai_chat_messages_seller" ON public.ai_chat_messages;

-- returns
DROP POLICY IF EXISTS "returns_seller_only" ON public.returns;

-- return_notes
DROP POLICY IF EXISTS "return_notes_via_return" ON public.return_notes;

-- expenses
DROP POLICY IF EXISTS "expenses_seller_only" ON public.expenses;

-- ------------------------------------------------------------
-- CREATE TEAM-AWARE MULTI-USER RLS POLICIES
-- ------------------------------------------------------------

-- sellers
CREATE POLICY "sellers_team_access" ON public.sellers
  FOR ALL
  USING (public.check_user_seller_access(id));

-- customers
CREATE POLICY "customers_team_access" ON public.customers
  FOR ALL
  USING (public.check_user_seller_access(seller_id))
  WITH CHECK (public.check_user_seller_access(seller_id));

-- products
CREATE POLICY "products_team_access" ON public.products
  FOR ALL
  USING (public.check_user_seller_access(seller_id))
  WITH CHECK (public.check_user_seller_access(seller_id));

-- orders
CREATE POLICY "orders_team_access" ON public.orders
  FOR ALL
  USING (public.check_user_seller_access(seller_id))
  WITH CHECK (public.check_user_seller_access(seller_id));

-- deliveries
CREATE POLICY "deliveries_team_access" ON public.deliveries
  FOR ALL
  USING (public.check_user_seller_access(seller_id))
  WITH CHECK (public.check_user_seller_access(seller_id));

-- automations
CREATE POLICY "automations_team_access" ON public.automations
  FOR ALL
  USING (public.check_user_seller_access(seller_id))
  WITH CHECK (public.check_user_seller_access(seller_id));

-- channels
CREATE POLICY "channels_team_access" ON public.channels
  FOR ALL
  USING (public.check_user_seller_access(seller_id))
  WITH CHECK (public.check_user_seller_access(seller_id));

-- conversations
CREATE POLICY "conversations_team_access" ON public.conversations
  FOR ALL
  USING (public.check_user_seller_access(seller_id))
  WITH CHECK (public.check_user_seller_access(seller_id));

-- messages
CREATE POLICY "messages_team_access" ON public.messages
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.conversations c 
    WHERE c.id = conversation_id 
      AND public.check_user_seller_access(c.seller_id)
  ));

-- integrations
CREATE POLICY "integrations_team_access" ON public.integrations
  FOR ALL
  USING (public.check_user_seller_access(seller_id))
  WITH CHECK (public.check_user_seller_access(seller_id));

-- agent_activity
CREATE POLICY "agent_activity_team_access" ON public.agent_activity
  FOR ALL
  USING (public.check_user_seller_access(seller_id))
  WITH CHECK (public.check_user_seller_access(seller_id));

-- whatsapp_templates
CREATE POLICY "whatsapp_templates_team_access" ON public.whatsapp_templates
  FOR ALL
  USING (public.check_user_seller_access(seller_id))
  WITH CHECK (public.check_user_seller_access(seller_id));

-- webhook_retry_queue
CREATE POLICY "webhook_retry_queue_team_access" ON public.webhook_retry_queue
  FOR ALL
  USING (public.check_user_seller_access(seller_id))
  WITH CHECK (public.check_user_seller_access(seller_id));

-- categories
CREATE POLICY "categories_team_access" ON public.categories
  FOR ALL
  USING (public.check_user_seller_access(seller_id))
  WITH CHECK (public.check_user_seller_access(seller_id));

-- notifications
CREATE POLICY "notifications_team_access" ON public.notifications
  FOR ALL
  USING (public.check_user_seller_access(seller_id))
  WITH CHECK (public.check_user_seller_access(seller_id));

-- webhook_events
CREATE POLICY "webhook_events_team_access" ON public.webhook_events
  FOR SELECT
  USING (public.check_user_seller_access(seller_id));

-- import_batches
CREATE POLICY "import_batches_team_access" ON public.import_batches
  FOR ALL
  USING (public.check_user_seller_access(seller_id))
  WITH CHECK (public.check_user_seller_access(seller_id));

-- ai_chat_sessions
CREATE POLICY "ai_chat_sessions_team_access" ON public.ai_chat_sessions
  FOR ALL
  USING (public.check_user_seller_access(seller_id))
  WITH CHECK (public.check_user_seller_access(seller_id));

-- ai_chat_messages
CREATE POLICY "ai_chat_messages_team_access" ON public.ai_chat_messages
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.ai_chat_sessions s
    WHERE s.id = session_id 
      AND public.check_user_seller_access(s.seller_id)
  ));

-- returns
CREATE POLICY "returns_team_access" ON public.returns
  FOR ALL
  USING (public.check_user_seller_access(seller_id))
  WITH CHECK (public.check_user_seller_access(seller_id));

-- return_notes
CREATE POLICY "return_notes_team_access" ON public.return_notes
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.returns r
    WHERE r.id = return_id 
      AND public.check_user_seller_access(r.seller_id)
  ));

-- expenses
CREATE POLICY "expenses_team_access" ON public.expenses
  FOR ALL
  USING (public.check_user_seller_access(seller_id))
  WITH CHECK (public.check_user_seller_access(seller_id));
