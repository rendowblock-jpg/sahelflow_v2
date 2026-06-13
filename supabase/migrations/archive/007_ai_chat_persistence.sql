-- Migration 007: AI Chat Persistence
-- Moves AI chat history from localStorage to Supabase
-- Enables cross-device sync and session management

-- ═══ Chat Sessions ═══
CREATE TABLE ai_chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'محادثة جديدة',
  message_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ═══ Chat Messages ═══
CREATE TABLE ai_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES ai_chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  tool_calls JSONB,
  action_cards JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ═══ RLS ═══
ALTER TABLE ai_chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_chat_sessions_seller_only" ON ai_chat_sessions
  FOR ALL
  USING (auth.uid() = seller_id)
  WITH CHECK (seller_id = auth.uid());

CREATE POLICY "ai_chat_messages_via_session" ON ai_chat_messages
  FOR ALL
  USING (session_id IN (
    SELECT id FROM ai_chat_sessions WHERE seller_id = auth.uid()
  ));

-- ═══ Indexes ═══
CREATE INDEX idx_ai_sessions_seller ON ai_chat_sessions(seller_id, updated_at DESC);
CREATE INDEX idx_ai_messages_session ON ai_chat_messages(session_id, created_at);

-- ═══ Triggers ═══
CREATE TRIGGER update_ai_sessions_updated_at
  BEFORE UPDATE ON ai_chat_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ═══ Auto-increment message count ═══
CREATE OR REPLACE FUNCTION increment_session_message_count()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE ai_chat_sessions
  SET message_count = message_count + 1,
      updated_at = now()
  WHERE id = NEW.session_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_session_on_message
  AFTER INSERT ON ai_chat_messages
  FOR EACH ROW EXECUTE FUNCTION increment_session_message_count();
