-- FD-048 / #317: retain reply drafts across conversation switches and restarts.
-- The canonical protected Prisma client encrypts this value in place.

ALTER TABLE "Conversation" ADD COLUMN "draftBody" TEXT;
ALTER TABLE "Conversation" ADD COLUMN "draftRevision" INTEGER NOT NULL DEFAULT 0;
