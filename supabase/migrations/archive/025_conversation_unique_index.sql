-- Migration 025: Conversation Unique Index
--
-- Prevents duplicate conversations for the same WhatsApp thread.
-- Critical for inbox deduplication when Evolution API webhooks
-- fire multiple times for the same conversation.
--
-- This index was previously missing from the local migration set
-- but existed on the production database (doc drift, now fixed).

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_channel_thread
  ON public.conversations (channel_id, platform_thread_id)
  WHERE platform_thread_id IS NOT NULL;
