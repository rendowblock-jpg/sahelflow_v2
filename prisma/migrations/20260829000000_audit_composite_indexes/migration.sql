-- Audit 7-d P3-7: composite indexes for inbox + message timeline hot paths.
-- Additive only. Index names follow Prisma's default naming so the migration
-- coordinator and `prisma migrate diff` see no drift with schema.prisma.

CREATE INDEX IF NOT EXISTS "Conversation_channel_lastMessageAt_idx" ON "Conversation"("channel", "lastMessageAt");

CREATE INDEX IF NOT EXISTS "Message_conversationId_direction_timestamp_idx" ON "Message"("conversationId", "direction", "timestamp");
