-- FD-048 / #317: quoted replies with visible context.
-- Outbound messages may reference the canonical Message they quote. Integrity
-- (same conversation, provider-confirmed target) is enforced at queue time by
-- the durable-send authority; the column is a projection for inbox rendering.

ALTER TABLE "Message" ADD COLUMN "quotedMessageId" TEXT;
CREATE INDEX "Message_quotedMessageId_idx" ON "Message"("quotedMessageId");
