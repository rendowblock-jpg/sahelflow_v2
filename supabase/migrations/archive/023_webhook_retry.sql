-- Phase 64A: Webhook Retry Queue
-- Stores failed webhook events for automatic retry with idempotency protection.

CREATE TABLE IF NOT EXISTS webhook_retry_queue (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  idempotency_key text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  seller_id uuid REFERENCES sellers(id),
  attempts int DEFAULT 0,
  max_attempts int DEFAULT 3,
  next_retry_at timestamptz DEFAULT now(),
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'dead_letter', 'dismissed')),
  error text,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  UNIQUE(idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_retry_queue_status ON webhook_retry_queue(status, next_retry_at);

ALTER TABLE webhook_retry_queue ENABLE ROW LEVEL SECURITY;

-- No RLS policies needed — service role only access (no direct seller access)
