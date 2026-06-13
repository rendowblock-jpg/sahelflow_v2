-- Migration: Fix deliveries.status constraint + add webhook event dedup
-- Applied: 2026-05-05

-- ===== 1. FIX DELIVERIES STATUS CHECK =====
-- The TypeScript adapters produce statuses: at_hub, out_for_delivery, refused
-- but the DB CHECK constraint was missing them, causing INSERT failures.

ALTER TABLE public.deliveries DROP CONSTRAINT IF EXISTS deliveries_status_check;
ALTER TABLE public.deliveries ADD CONSTRAINT deliveries_status_check
  CHECK (status IN (
    'pending',
    'created',
    'picked_up',
    'in_transit',
    'at_hub',
    'out_for_delivery',
    'delivered',
    'returned',
    'refused',
    'failed'
  ));

-- ===== 2. WEBHOOK EVENT DEDUPLICATION =====
-- Shopify retries webhooks if our handler doesn't respond within 5s.
-- WooCommerce also retries. We need to track processed event IDs to avoid
-- creating duplicate orders on platform retries.

CREATE TABLE IF NOT EXISTS public.webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,                -- 'shopify', 'woocommerce', 'evolution'
  event_id TEXT NOT NULL,                -- X-Shopify-Event-Id, X-WC-Webhook-Delivery-ID, etc.
  topic TEXT,                            -- X-Shopify-Topic, X-WC-Webhook-Topic
  received_at TIMESTAMPTZ DEFAULT now()
);

-- Composite unique index: same event from same platform for same seller = dedup
CREATE UNIQUE INDEX IF NOT EXISTS webhook_events_dedup_idx
  ON public.webhook_events (seller_id, platform, event_id);

-- Performance index for cleanup jobs
CREATE INDEX IF NOT EXISTS webhook_events_received_at_idx
  ON public.webhook_events (received_at);

-- ===== 3. RLS POLICIES =====
-- webhook_events are written by the service_role during webhook processing.
-- Sellers can read their own events for debugging.

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "webhook_events_service_all" ON public.webhook_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "webhook_events_seller_select" ON public.webhook_events
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = seller_id);

-- ===== 4. CLEANUP (Optional periodic maintenance) =====
-- Keep webhook event records for 7 days then let a cron job clean them up.
-- For now we rely on periodic cleanup or manual deletion.
