-- Agents: image input. Images a seller attaches to a chat turn.
-- Additive only. The image bytes are stored sealed (business envelope key);
-- rows cascade with their chat message.

CREATE TABLE "AiChatAttachment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "messageId" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "payload" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiChatAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "AiChatMessage" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "AiChatAttachment_messageId_idx" ON "AiChatAttachment"("messageId");
