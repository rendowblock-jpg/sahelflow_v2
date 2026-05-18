-- Confirmation workflow columns
-- Separate from order lifecycle status to avoid breaking existing OrderStatus switches.
-- Tracks the confirmation call substatus within the 'pending' phase.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS confirmation_status TEXT DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS confirmation_attempts INT DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS confirmation_notes TEXT DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS return_reason TEXT DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS upsell_offered BOOLEAN DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS upsell_accepted BOOLEAN DEFAULT FALSE;

-- Index for duplicate detection queries
CREATE INDEX IF NOT EXISTS idx_orders_pending_by_phone
  ON orders (seller_id, created_at DESC)
  WHERE status IN ('draft', 'pending');

COMMENT ON COLUMN orders.confirmation_status IS
  'Confirmation call substatus: rappel, en_attente, doublon, faux_numero, boite_vocale, confirmed, annule. NULL = not yet attempted.';
COMMENT ON COLUMN orders.return_reason IS
  'Required when status = returned/refused. Values: wrong_product, damaged, changed_mind, not_as_described, wrong_size, other';
