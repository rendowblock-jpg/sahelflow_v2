-- Phase 3: durable WhatsApp send intents, leases, receipts and operator recovery.
--
-- Payloads are encrypted by the business command kernel. Worker columns contain
-- only bounded state/error/receipt metadata. Provider correlation is stored in a
-- dedicated table so the existing Message schema remains compatibility-safe.

ALTER TABLE "OutboxIntent" ADD COLUMN "lockedAt" DATETIME;
ALTER TABLE "OutboxIntent" ADD COLUMN "leaseToken" TEXT;
ALTER TABLE "OutboxIntent" ADD COLUMN "effectStartedAt" DATETIME;
ALTER TABLE "OutboxIntent" ADD COLUMN "lastErrorCode" TEXT;
ALTER TABLE "OutboxIntent" ADD COLUMN "outcomeState" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "OutboxIntent" ADD COLUMN "receiptJson" TEXT;
ALTER TABLE "OutboxIntent" ADD COLUMN "succeededAt" DATETIME;
ALTER TABLE "OutboxIntent" ADD COLUMN "deadLetteredAt" DATETIME;

CREATE INDEX "OutboxIntent_effectType_status_nextAttemptAt_idx"
  ON "OutboxIntent"("effectType", "status", "nextAttemptAt");
CREATE INDEX "OutboxIntent_status_lockedAt_idx"
  ON "OutboxIntent"("status", "lockedAt");

CREATE TABLE "WhatsAppOutboundEffect" (
  "effectKey" TEXT NOT NULL PRIMARY KEY,
  "messageId" TEXT NOT NULL,
  "providerMessageId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WhatsAppOutboundEffect_messageId_fkey"
    FOREIGN KEY ("messageId") REFERENCES "Message" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "WhatsAppOutboundEffect_messageId_key"
  ON "WhatsAppOutboundEffect"("messageId");
CREATE UNIQUE INDEX "WhatsAppOutboundEffect_providerMessageId_key"
  ON "WhatsAppOutboundEffect"("providerMessageId");