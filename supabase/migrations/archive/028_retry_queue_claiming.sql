-- Phase 1: Retry queue claiming exclusivity
-- Prevent concurrent processors from double-processing the same event.

ALTER TABLE public.webhook_retry_queue
  ADD COLUMN IF NOT EXISTS claimed_by text,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS locked_until timestamptz;

CREATE INDEX IF NOT EXISTS idx_retry_queue_claimed_by
  ON public.webhook_retry_queue(claimed_by)
  WHERE claimed_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_retry_queue_locked_until
  ON public.webhook_retry_queue(locked_until)
  WHERE locked_until IS NOT NULL;

