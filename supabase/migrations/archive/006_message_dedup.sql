-- Add platform_message_id for deduplication
ALTER TABLE messages ADD COLUMN IF NOT EXISTS platform_message_id TEXT;

-- Unique index to prevent duplicate messages (only where platform_message_id is not null)
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_dedup 
  ON messages(conversation_id, platform_message_id) 
  WHERE platform_message_id IS NOT NULL;

-- Add metadata column to conversations for AI results
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Add last_message_preview to conversations for sidebar display
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_message_preview TEXT DEFAULT '';
