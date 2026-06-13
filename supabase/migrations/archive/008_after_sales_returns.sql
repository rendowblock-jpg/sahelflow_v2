-- Migration 008: After-Sales & Returns Workflow
-- Complete returns management system with multi-stage tracking

-- ═══ Return Requests ═══
CREATE TABLE returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id),

  -- Return details
  return_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK (status IN (
      'requested',    -- Customer initiated
      'approved',     -- Seller approved
      'pickup',       -- Package being collected
      'received',     -- Seller received package
      'inspected',    -- Package inspected
      'refunded',     -- Refund issued
      'exchanged',    -- Exchange sent
      'rejected',     -- Return denied
      'closed'        -- Case closed
    )),

  reason TEXT NOT NULL
    CHECK (reason IN (
      'wrong_product',
      'damaged',
      'changed_mind',
      'not_as_described',
      'wrong_size',
      'defective',
      'late_delivery',
      'other'
    )),
  reason_details TEXT,

  -- Resolution
  resolution_type TEXT DEFAULT 'refund'
    CHECK (resolution_type IN ('refund', 'exchange', 'credit', 'reject')),
  refund_amount NUMERIC(12,2) DEFAULT 0,
  exchange_order_id UUID REFERENCES orders(id),

  -- Items being returned
  items JSONB NOT NULL DEFAULT '[]',

  -- Photos (Supabase Storage paths)
  photos TEXT[] DEFAULT '{}',

  -- Tracking
  return_tracking_id TEXT,
  return_delivery_company TEXT,

  -- Timestamps
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ═══ Return Notes / Timeline ═══
CREATE TABLE return_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id UUID NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
  author_id UUID REFERENCES sellers(id),
  type TEXT NOT NULL DEFAULT 'note'
    CHECK (type IN ('note', 'status_change', 'system', 'customer')),
  content TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ═══ RLS ═══
ALTER TABLE returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE return_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "returns_seller_only" ON returns
  FOR ALL
  USING (seller_id = auth.uid())
  WITH CHECK (seller_id = auth.uid());

CREATE POLICY "return_notes_via_return" ON return_notes
  FOR ALL
  USING (return_id IN (
    SELECT id FROM returns WHERE seller_id = auth.uid()
  ));

-- ═══ Indexes ═══
CREATE INDEX idx_returns_seller ON returns(seller_id, created_at DESC);
CREATE INDEX idx_returns_order ON returns(order_id);
CREATE INDEX idx_returns_status ON returns(seller_id, status);
CREATE INDEX idx_return_notes_return ON return_notes(return_id, created_at);

-- ═══ Sequence for return numbers ═══
CREATE SEQUENCE return_number_seq START 1000;

-- ═══ Trigger: auto-generate return number ═══
CREATE OR REPLACE FUNCTION generate_return_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.return_number IS NULL OR NEW.return_number = '' THEN
    NEW.return_number := 'RET-' || LPAD(nextval('return_number_seq')::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_return_number
  BEFORE INSERT ON returns
  FOR EACH ROW EXECUTE FUNCTION generate_return_number();

-- ═══ Trigger: updated_at ═══
CREATE TRIGGER update_returns_updated_at
  BEFORE UPDATE ON returns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ═══ Trigger: auto-create timeline entry on status change ═══
CREATE OR REPLACE FUNCTION log_return_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO return_notes (return_id, type, content, metadata)
    VALUES (
      NEW.id,
      'status_change',
      'Status changed from ' || OLD.status || ' to ' || NEW.status,
      jsonb_build_object('from', OLD.status, 'to', NEW.status)
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER log_return_status
  AFTER UPDATE ON returns
  FOR EACH ROW EXECUTE FUNCTION log_return_status_change();
