-- PB-CONV-SEARCH-LOAD, slice 2: the persisted index for the inbox conversation search (tables and triggers only).
--
-- Why: today every conversation search opens up to 25,000 sealed message bodies one by one (1.2 to 2.3 s on a
-- shop with 25,000 messages, measured). The index lets the search open only the few messages that can match.
--
-- What this migration does NOT do, on purpose:
--  * It copies nothing out of Message or Conversation (no INSERT ... SELECT). Filling the index for the
--    existing messages is done later, in small idle chunks by the app, never on the start-up path
--    (NEW-FIRST-LAUNCH-MIGRATION-45S: a slow disk pays for every statement here).
--  * It changes no existing table, row or index. Only CREATE TABLE / INDEX / TRIGGER and one INSERT of the
--    single state row. Nothing here can lose data; rolling back means a later migration that drops the
--    triggers (the index is derived and can be rebuilt).
--
-- The triggers cannot read a message body (it is sealed), so they only (a) remove the index rows of a message
-- or conversation that changed or disappeared and (b) queue it in ConversationSearchDirty; the app re-indexes
-- from that queue. A trigger fires inside the same transaction as the write, whichever code path made it, and
-- on cascade deletes (a deleted Conversation removes its Messages through the foreign key).

CREATE TABLE "ConversationSearchDoc" (
  "docId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "kind" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL
);
CREATE UNIQUE INDEX "ConversationSearchDoc_kind_entityId_key" ON "ConversationSearchDoc"("kind", "entityId");
CREATE INDEX "ConversationSearchDoc_conversationId_idx" ON "ConversationSearchDoc"("conversationId");

CREATE TABLE "ConversationSearchToken" (
  "docId" INTEGER NOT NULL,
  "tokenHash" BIGINT NOT NULL,
  PRIMARY KEY ("docId", "tokenHash")
) WITHOUT ROWID;
CREATE INDEX "ConversationSearchToken_tokenHash_docId_idx" ON "ConversationSearchToken"("tokenHash", "docId");

CREATE TABLE "ConversationSearchDirty" (
  "kind" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  PRIMARY KEY ("kind", "entityId")
);
CREATE INDEX "ConversationSearchDirty_conversationId_idx" ON "ConversationSearchDirty"("conversationId");

CREATE TABLE "ConversationSearchState" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "scheme" INTEGER NOT NULL DEFAULT 1,
  "completedAt" DATETIME
);
INSERT INTO "ConversationSearchState" ("id", "scheme") VALUES ('conversation-index', 1);

-- Trigger bodies never say "INSERT OR IGNORE": SQLite lets the OUTER statement's conflict policy override it, and Prisma's
-- upsert is "INSERT ... ON CONFLICT DO UPDATE", so a row that was already queued made the app's own write fail with a
-- unique-constraint error (found by the full suite: the WhatsApp inbound processor stored nothing). The queue insert uses
-- its own "ON CONFLICT (kind, entityId) DO NOTHING", which the outer statement cannot override.

-- A new message is queued for indexing.
CREATE TRIGGER "conversation_search_message_insert" AFTER INSERT ON "Message" BEGIN
  INSERT INTO "ConversationSearchDirty" ("kind", "entityId", "conversationId")
    VALUES ('M', NEW."id", NEW."conversationId")
    ON CONFLICT ("kind", "entityId") DO NOTHING;
END;

-- A message whose sealed body (or conversation) changed loses its index rows and is queued again.
-- Status-only updates (deliveryStatus) do not fire it.
CREATE TRIGGER "conversation_search_message_body_update" AFTER UPDATE OF "body", "conversationId" ON "Message" BEGIN
  DELETE FROM "ConversationSearchToken" WHERE "docId" IN
    (SELECT "docId" FROM "ConversationSearchDoc" WHERE "kind" = 'M' AND "entityId" = OLD."id");
  DELETE FROM "ConversationSearchDoc" WHERE "kind" = 'M' AND "entityId" = OLD."id";
  INSERT INTO "ConversationSearchDirty" ("kind", "entityId", "conversationId")
    VALUES ('M', NEW."id", NEW."conversationId")
    ON CONFLICT ("kind", "entityId") DO NOTHING;
END;

-- A deleted message (also by cascade) leaves nothing behind.
CREATE TRIGGER "conversation_search_message_delete" AFTER DELETE ON "Message" BEGIN
  DELETE FROM "ConversationSearchToken" WHERE "docId" IN
    (SELECT "docId" FROM "ConversationSearchDoc" WHERE "kind" = 'M' AND "entityId" = OLD."id");
  DELETE FROM "ConversationSearchDoc" WHERE "kind" = 'M' AND "entityId" = OLD."id";
  DELETE FROM "ConversationSearchDirty" WHERE "kind" = 'M' AND "entityId" = OLD."id";
END;

-- The contact part of a conversation (name and phone) is indexed as its own document.
CREATE TRIGGER "conversation_search_conversation_insert" AFTER INSERT ON "Conversation" BEGIN
  INSERT INTO "ConversationSearchDirty" ("kind", "entityId", "conversationId")
    VALUES ('C', NEW."id", NEW."id")
    ON CONFLICT ("kind", "entityId") DO NOTHING;
END;

CREATE TRIGGER "conversation_search_conversation_contact_update" AFTER UPDATE OF "contactName", "contactPhone" ON "Conversation" BEGIN
  DELETE FROM "ConversationSearchToken" WHERE "docId" IN
    (SELECT "docId" FROM "ConversationSearchDoc" WHERE "kind" = 'C' AND "entityId" = OLD."id");
  DELETE FROM "ConversationSearchDoc" WHERE "kind" = 'C' AND "entityId" = OLD."id";
  INSERT INTO "ConversationSearchDirty" ("kind", "entityId", "conversationId")
    VALUES ('C', NEW."id", NEW."id")
    ON CONFLICT ("kind", "entityId") DO NOTHING;
END;

CREATE TRIGGER "conversation_search_conversation_delete" AFTER DELETE ON "Conversation" BEGIN
  DELETE FROM "ConversationSearchToken" WHERE "docId" IN
    (SELECT "docId" FROM "ConversationSearchDoc" WHERE "kind" = 'C' AND "entityId" = OLD."id");
  DELETE FROM "ConversationSearchDoc" WHERE "kind" = 'C' AND "entityId" = OLD."id";
  DELETE FROM "ConversationSearchDirty" WHERE "conversationId" = OLD."id";
END;
