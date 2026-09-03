-- Ledger INB-12: WhatsApp conversation states — pin, mute, archive.
-- All columns are additive and nullable: every existing row keeps its exact
-- current meaning (unpinned, unmuted, active queue member).

ALTER TABLE "Conversation" ADD COLUMN "pinnedAt" DATETIME;
ALTER TABLE "Conversation" ADD COLUMN "mutedUntil" DATETIME;
ALTER TABLE "Conversation" ADD COLUMN "archivedAt" DATETIME;
CREATE INDEX "Conversation_archivedAt_idx" ON "Conversation"("archivedAt");
