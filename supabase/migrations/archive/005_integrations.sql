CREATE TABLE IF NOT EXISTS integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID REFERENCES sellers(id) ON DELETE CASCADE NOT NULL,
  platform TEXT NOT NULL, -- 'shopify', 'woocommerce', 'yalidine', 'mayestro', 'zrexpress'
  credentials JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  last_sync TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(seller_id, platform)
);

ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sellers manage own integrations"
  ON integrations FOR ALL
  USING (seller_id = auth.uid());
