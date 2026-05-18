-- Update orders status CHECK constraint to include 'draft' status
-- Used by the AI Communication Agent for WhatsApp message extractions

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check 
  CHECK (status IN ('draft','pending','confirmed','shipped','delivered','returned','refused','cancelled'));
