-- Ledger AI-13: per-answer quality feedback for the AI agents quality loop.
-- One row per assistant message (unique messageId): the opposite thumb
-- overwrites, the active thumb deletes. Cascade with the owning message.

CREATE TABLE "AiMessageFeedback" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "messageId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiMessageFeedback_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "AiChatMessage" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AiMessageFeedback_messageId_key" ON "AiMessageFeedback"("messageId");
CREATE INDEX "AiMessageFeedback_value_createdAt_idx" ON "AiMessageFeedback"("value", "createdAt");
