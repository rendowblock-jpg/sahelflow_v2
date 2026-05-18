CREATE TABLE IF NOT EXISTS agent_activity (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  seller_id UUID REFERENCES sellers(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_agent_activity_seller ON agent_activity(seller_id, created_at DESC);

ALTER TABLE agent_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sellers see own activity"
  ON agent_activity FOR SELECT
  USING (seller_id = auth.uid());

CREATE POLICY "System inserts activity"
  ON agent_activity FOR INSERT
  WITH CHECK (seller_id = auth.uid());
