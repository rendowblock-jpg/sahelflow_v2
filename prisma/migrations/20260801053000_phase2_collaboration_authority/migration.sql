-- Phase 2 collaboration authority.
-- Member IDs are authenticated installation-authority references and therefore
-- intentionally have no shop-database foreign key.

CREATE TABLE "CollaborationWorkgroup" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "state" TEXT NOT NULL DEFAULT 'active',
  "createdByMemberId" TEXT NOT NULL,
  "archivedByMemberId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "archivedAt" DATETIME,
  CONSTRAINT "CollaborationWorkgroup_state_check"
    CHECK ("state" IN ('active', 'archived')),
  CONSTRAINT "CollaborationWorkgroup_archive_check"
    CHECK (
      ("state" = 'active' AND "archivedAt" IS NULL AND "archivedByMemberId" IS NULL)
      OR
      ("state" = 'archived' AND "archivedAt" IS NOT NULL AND "archivedByMemberId" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "CollaborationWorkgroup_name_key"
  ON "CollaborationWorkgroup"("name");
CREATE INDEX "CollaborationWorkgroup_state_name_idx"
  ON "CollaborationWorkgroup"("state", "name");
CREATE INDEX "CollaborationWorkgroup_createdByMemberId_createdAt_idx"
  ON "CollaborationWorkgroup"("createdByMemberId", "createdAt");

CREATE TABLE "CollaborationWorkgroupMember" (
  "workgroupId" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'member',
  "addedByMemberId" TEXT NOT NULL,
  "removedByMemberId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "removedAt" DATETIME,
  PRIMARY KEY ("workgroupId", "memberId"),
  CONSTRAINT "CollaborationWorkgroupMember_workgroupId_fkey"
    FOREIGN KEY ("workgroupId") REFERENCES "CollaborationWorkgroup"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CollaborationWorkgroupMember_role_check"
    CHECK ("role" IN ('lead', 'member')),
  CONSTRAINT "CollaborationWorkgroupMember_removed_check"
    CHECK (
      ("removedAt" IS NULL AND "removedByMemberId" IS NULL)
      OR
      ("removedAt" IS NOT NULL AND "removedByMemberId" IS NOT NULL)
    )
);

CREATE INDEX "CollaborationWorkgroupMember_memberId_removedAt_idx"
  ON "CollaborationWorkgroupMember"("memberId", "removedAt");
CREATE INDEX "CollaborationWorkgroupMember_workgroupId_removedAt_idx"
  ON "CollaborationWorkgroupMember"("workgroupId", "removedAt");

CREATE TABLE "CollaborationQueue" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "entityType" TEXT NOT NULL,
  "workgroupId" TEXT,
  "state" TEXT NOT NULL DEFAULT 'active',
  "createdByMemberId" TEXT NOT NULL,
  "archivedByMemberId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "archivedAt" DATETIME,
  CONSTRAINT "CollaborationQueue_workgroupId_fkey"
    FOREIGN KEY ("workgroupId") REFERENCES "CollaborationWorkgroup"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CollaborationQueue_entityType_check"
    CHECK ("entityType" IN ('conversation', 'order', 'confirmation')),
  CONSTRAINT "CollaborationQueue_state_check"
    CHECK ("state" IN ('active', 'archived')),
  CONSTRAINT "CollaborationQueue_archive_check"
    CHECK (
      ("state" = 'active' AND "archivedAt" IS NULL AND "archivedByMemberId" IS NULL)
      OR
      ("state" = 'archived' AND "archivedAt" IS NOT NULL AND "archivedByMemberId" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "CollaborationQueue_key_key"
  ON "CollaborationQueue"("key");
CREATE INDEX "CollaborationQueue_entityType_state_name_idx"
  ON "CollaborationQueue"("entityType", "state", "name");
CREATE INDEX "CollaborationQueue_workgroupId_state_idx"
  ON "CollaborationQueue"("workgroupId", "state");

CREATE TABLE "CollaborationAssignment" (
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "queueId" TEXT,
  "workgroupId" TEXT,
  "assigneeMemberId" TEXT,
  "state" TEXT NOT NULL DEFAULT 'open',
  "generation" INTEGER NOT NULL DEFAULT 0,
  "updatedByMemberId" TEXT NOT NULL,
  "commandId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("entityType", "entityId"),
  CONSTRAINT "CollaborationAssignment_queueId_fkey"
    FOREIGN KEY ("queueId") REFERENCES "CollaborationQueue"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CollaborationAssignment_workgroupId_fkey"
    FOREIGN KEY ("workgroupId") REFERENCES "CollaborationWorkgroup"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CollaborationAssignment_entityType_check"
    CHECK ("entityType" IN ('conversation', 'order', 'confirmation')),
  CONSTRAINT "CollaborationAssignment_state_check"
    CHECK ("state" IN ('open', 'closed')),
  CONSTRAINT "CollaborationAssignment_generation_check"
    CHECK ("generation" >= 0)
);

CREATE UNIQUE INDEX "CollaborationAssignment_commandId_key"
  ON "CollaborationAssignment"("commandId");
CREATE INDEX "CollaborationAssignment_queueId_state_updatedAt_idx"
  ON "CollaborationAssignment"("queueId", "state", "updatedAt");
CREATE INDEX "CollaborationAssignment_workgroupId_state_updatedAt_idx"
  ON "CollaborationAssignment"("workgroupId", "state", "updatedAt");
CREATE INDEX "CollaborationAssignment_assigneeMemberId_state_updatedAt_idx"
  ON "CollaborationAssignment"("assigneeMemberId", "state", "updatedAt");

CREATE TABLE "CollaborationComment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "authorMemberId" TEXT NOT NULL,
  "bodyJson" TEXT NOT NULL,
  "commandId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CollaborationComment_entityType_check"
    CHECK ("entityType" IN ('conversation', 'order', 'confirmation'))
);

CREATE UNIQUE INDEX "CollaborationComment_commandId_key"
  ON "CollaborationComment"("commandId");
CREATE INDEX "CollaborationComment_entityType_entityId_createdAt_idx"
  ON "CollaborationComment"("entityType", "entityId", "createdAt");
CREATE INDEX "CollaborationComment_authorMemberId_createdAt_idx"
  ON "CollaborationComment"("authorMemberId", "createdAt");

CREATE TABLE "CollaborationMention" (
  "commentId" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("commentId", "memberId"),
  CONSTRAINT "CollaborationMention_commentId_fkey"
    FOREIGN KEY ("commentId") REFERENCES "CollaborationComment"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "CollaborationMention_memberId_createdAt_idx"
  ON "CollaborationMention"("memberId", "createdAt");

CREATE TABLE "CollaborationHandover" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "fromMemberId" TEXT,
  "toMemberId" TEXT,
  "fromQueueId" TEXT,
  "toQueueId" TEXT,
  "fromWorkgroupId" TEXT,
  "toWorkgroupId" TEXT,
  "reasonJson" TEXT,
  "commandId" TEXT NOT NULL,
  "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CollaborationHandover_entityType_check"
    CHECK ("entityType" IN ('conversation', 'order', 'confirmation')),
  CONSTRAINT "CollaborationHandover_change_check"
    CHECK (
      "fromMemberId" IS NOT "toMemberId"
      OR "fromQueueId" IS NOT "toQueueId"
      OR "fromWorkgroupId" IS NOT "toWorkgroupId"
    )
);

CREATE UNIQUE INDEX "CollaborationHandover_commandId_key"
  ON "CollaborationHandover"("commandId");
CREATE INDEX "CollaborationHandover_entityType_entityId_occurredAt_idx"
  ON "CollaborationHandover"("entityType", "entityId", "occurredAt");
CREATE INDEX "CollaborationHandover_fromMemberId_occurredAt_idx"
  ON "CollaborationHandover"("fromMemberId", "occurredAt");
CREATE INDEX "CollaborationHandover_toMemberId_occurredAt_idx"
  ON "CollaborationHandover"("toMemberId", "occurredAt");
CREATE INDEX "CollaborationHandover_toQueueId_occurredAt_idx"
  ON "CollaborationHandover"("toQueueId", "occurredAt");

-- Append-only collaboration facts. Current-state workgroup, queue and assignment
-- rows remain mutable through governed commands; comments, mentions and handover
-- facts can only be superseded by later facts.
CREATE TRIGGER "CollaborationComment_no_update"
BEFORE UPDATE ON "CollaborationComment"
BEGIN
  SELECT RAISE(ABORT, 'CollaborationComment is append-only');
END;

CREATE TRIGGER "CollaborationMention_no_update"
BEFORE UPDATE ON "CollaborationMention"
BEGIN
  SELECT RAISE(ABORT, 'CollaborationMention is append-only');
END;

CREATE TRIGGER "CollaborationHandover_no_update"
BEFORE UPDATE ON "CollaborationHandover"
BEGIN
  SELECT RAISE(ABORT, 'CollaborationHandover is append-only');
END;
