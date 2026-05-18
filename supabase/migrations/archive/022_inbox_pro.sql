-- Inbox Pro: conversation labels, pin, archive + message reply_to + quoted text
-- Phase 59: WhatsApp Inbox Pro enhancement

-- Add conversation metadata columns
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT false;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS labels TEXT[] DEFAULT '{}';

-- Add message reply support
ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES messages(id) ON DELETE SET NULL;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS quoted_text TEXT;

-- Index for pinned/archived filtering
CREATE INDEX IF NOT EXISTS idx_conversations_pinned ON conversations(seller_id, is_pinned DESC, last_message_at DESC) WHERE is_pinned = true;
CREATE INDEX IF NOT EXISTS idx_conversations_archived ON conversations(seller_id, is_archived) WHERE is_archived = true;
