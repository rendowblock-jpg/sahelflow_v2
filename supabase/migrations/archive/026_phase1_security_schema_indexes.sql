-- ============================================================
-- SahelFlow Migration 026: Phase 1 Security, Schema & Indexes
-- ============================================================
-- This migration corrects issues identified in the full codebase audit:
-- 1. Three functions with mutable search_path (migration 014 referenced wrong names)
-- 2. Missing unique index for Shopify product sync upsert
-- 3. Missing unique partial index for webhook order deduplication
-- 4. webhook_retry_queue had RLS enabled but zero policies (default-deny)
-- 5. Inbox Pro columns missing from live DB (Phase 59 features broken)
-- 6. Three unindexed foreign keys flagged by Supabase performance advisor
-- ============================================================

-- ── 1. Fix mutable search_path on the 3 functions migration 014 missed ──
-- Migration 014 referenced "update_updated_at_column" (wrong name).
-- The actual function created in 001_core_schema.sql is "update_updated_at".
-- Confirmed via pg_proc: all three have config = null (unfixed).
ALTER FUNCTION public.update_updated_at() SET search_path = '';
ALTER FUNCTION public.generate_order_number() SET search_path = '';
ALTER FUNCTION public.handle_new_user() SET search_path = '';

-- ── 2. Unique index for Shopify product sync ──
-- src/app/api/integrations/sync/route.ts does:
--   .upsert(mapped, { onConflict: "seller_id,name" })
-- PostgreSQL requires a real unique constraint/index for ON CONFLICT to work.
-- Without this the upsert throws a generic error and sync silently breaks.
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_seller_name
  ON public.products(seller_id, name);

-- ── 3. Unique partial index for webhook order deduplication ──
-- src/app/api/webhooks/store/[token]/route.ts uses a read-then-insert
-- dedup pattern. Under concurrent webhook delivery, two requests can
-- create duplicate orders. This index enforces idempotency at the DB level.
-- Partial index: only applies when external_id is not null.
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_seller_external_id
  ON public.orders(seller_id, external_id)
  WHERE external_id IS NOT NULL;

-- ── 4. RLS policy for webhook_retry_queue ──
-- Table has RLS enabled but zero policies = default-deny for all non-service-role.
-- The retry processor uses a service role client (bypasses RLS anyway).
-- Adding a SELECT policy so authenticated sellers can view their own events.
CREATE POLICY "Sellers can view own retry events"
  ON public.webhook_retry_queue
  FOR SELECT
  USING ((select auth.uid()) = seller_id);

-- ── 5. Inbox Pro columns (Phase 59 — confirmed missing from live DB) ──
-- Migration 022_inbox_pro.sql was written but never applied via the migration
-- system. These columns are required for pin/archive/labels/reply features.

-- conversations: pin, archive, labels support
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS is_pinned   BOOLEAN  NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN  NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS labels      TEXT[]   NOT NULL DEFAULT '{}';

-- messages: reply quoting support
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS reply_to_id  UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS quoted_text  TEXT;

-- Indexes for new conversation columns (common inbox query patterns)
CREATE INDEX IF NOT EXISTS idx_conversations_pinned
  ON public.conversations(seller_id, last_message_at DESC)
  WHERE is_pinned = true;

CREATE INDEX IF NOT EXISTS idx_conversations_archived
  ON public.conversations(seller_id, is_archived, last_message_at DESC);

-- Index for reply chain lookups
CREATE INDEX IF NOT EXISTS idx_messages_reply_to
  ON public.messages(reply_to_id)
  WHERE reply_to_id IS NOT NULL;

-- ── 6. Missing FK covering indexes (flagged by Supabase performance advisor) ──

-- deliveries.seller_id — FK with no covering index
CREATE INDEX IF NOT EXISTS idx_deliveries_seller_id
  ON public.deliveries(seller_id);

-- orders.conversation_id — FK with no covering index
CREATE INDEX IF NOT EXISTS idx_orders_conversation_id
  ON public.orders(conversation_id)
  WHERE conversation_id IS NOT NULL;

-- webhook_retry_queue.seller_id — FK with no covering index
CREATE INDEX IF NOT EXISTS idx_retry_queue_seller_id
  ON public.webhook_retry_queue(seller_id)
  WHERE seller_id IS NOT NULL;
