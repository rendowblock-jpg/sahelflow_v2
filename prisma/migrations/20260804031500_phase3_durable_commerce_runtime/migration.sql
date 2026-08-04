-- Phase 3 Task 6: durable commerce run, page, item and attempt authority.

CREATE TABLE "CommerceSyncRun" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "runKey" TEXT NOT NULL,
  "activeKey" TEXT,
  "platform" TEXT NOT NULL,
  "integrationId" TEXT NOT NULL,
  "sourceIdentity" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "initialWatermark" TEXT NOT NULL,
  "candidateWatermark" TEXT NOT NULL DEFAULT '',
  "continuationCursor" TEXT,
  "pagesPerCycle" INTEGER NOT NULL DEFAULT 10,
  "pagesFetched" INTEGER NOT NULL DEFAULT 0,
  "fetchComplete" BOOLEAN NOT NULL DEFAULT false,
  "hasMore" BOOLEAN NOT NULL DEFAULT false,
  "fetchedCount" INTEGER NOT NULL DEFAULT 0,
  "createdCount" INTEGER NOT NULL DEFAULT 0,
  "updatedCount" INTEGER NOT NULL DEFAULT 0,
  "skippedCount" INTEGER NOT NULL DEFAULT 0,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "operatorRetryCount" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" DATETIME,
  "lockedAt" DATETIME,
  "leaseToken" TEXT,
  "lastErrorCode" TEXT,
  "startedAt" DATETIME,
  "completedAt" DATETIME,
  "deadLetteredAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommerceSyncRun_status_check" CHECK (
    "status" IN (
      'queued',
      'fetching',
      'processing',
      'retrying',
      'succeeded',
      'partially_completed',
      'dead_letter',
      'cancelled'
    )
  ),
  CONSTRAINT "CommerceSyncRun_pages_per_cycle_check" CHECK (
    "pagesPerCycle" >= 1 AND "pagesPerCycle" <= 50
  )
);

CREATE TABLE "CommerceSyncPage" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "pageKey" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "pageNumber" INTEGER NOT NULL,
  "cursorBefore" TEXT,
  "cursorAfter" TEXT,
  "candidateWatermark" TEXT NOT NULL DEFAULT '',
  "itemCount" INTEGER NOT NULL,
  "pageHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'persisted',
  "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommerceSyncPage_runId_fkey"
    FOREIGN KEY ("runId") REFERENCES "CommerceSyncRun" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CommerceSyncPage_status_check" CHECK (
    "status" IN ('persisted', 'superseded')
  )
);

CREATE TABLE "CommerceSyncItem" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "itemKey" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "pageId" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "sourceOrderId" TEXT NOT NULL,
  "sourceRevision" TEXT NOT NULL,
  "payloadJson" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "outcome" TEXT,
  "canonicalOrderId" TEXT,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 5,
  "operatorRetryCount" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" DATETIME,
  "lockedAt" DATETIME,
  "leaseToken" TEXT,
  "lastErrorCode" TEXT,
  "startedAt" DATETIME,
  "completedAt" DATETIME,
  "deadLetteredAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommerceSyncItem_runId_fkey"
    FOREIGN KEY ("runId") REFERENCES "CommerceSyncRun" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CommerceSyncItem_pageId_fkey"
    FOREIGN KEY ("pageId") REFERENCES "CommerceSyncPage" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CommerceSyncItem_status_check" CHECK (
    "status" IN (
      'queued',
      'processing',
      'retrying',
      'succeeded',
      'skipped',
      'quarantined',
      'dead_letter'
    )
  ),
  CONSTRAINT "CommerceSyncItem_attempts_check" CHECK (
    "attemptCount" >= 0 AND "maxAttempts" >= 1
  )
);

CREATE TABLE "CommerceSyncRunAttempt" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "runId" TEXT NOT NULL,
  "attemptNumber" INTEGER NOT NULL,
  "phase" TEXT NOT NULL,
  "leaseToken" TEXT,
  "state" TEXT NOT NULL,
  "errorCode" TEXT,
  "detailJson" TEXT,
  "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommerceSyncRunAttempt_runId_fkey"
    FOREIGN KEY ("runId") REFERENCES "CommerceSyncRun" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CommerceSyncRunAttempt_phase_check" CHECK (
    "phase" IN ('fetch', 'finalize')
  ),
  CONSTRAINT "CommerceSyncRunAttempt_state_check" CHECK (
    "state" IN ('processing', 'succeeded', 'retrying', 'failed', 'lease_expired')
  )
);

CREATE TABLE "CommerceSyncItemAttempt" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "itemId" TEXT NOT NULL,
  "attemptNumber" INTEGER NOT NULL,
  "leaseToken" TEXT,
  "state" TEXT NOT NULL,
  "errorCode" TEXT,
  "detailJson" TEXT,
  "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommerceSyncItemAttempt_itemId_fkey"
    FOREIGN KEY ("itemId") REFERENCES "CommerceSyncItem" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CommerceSyncItemAttempt_state_check" CHECK (
    "state" IN (
      'processing',
      'succeeded',
      'skipped',
      'retrying',
      'quarantined',
      'dead_letter',
      'lease_expired'
    )
  )
);

CREATE UNIQUE INDEX "CommerceSyncRun_runKey_key"
  ON "CommerceSyncRun" ("runKey");
CREATE UNIQUE INDEX "CommerceSyncRun_activeKey_key"
  ON "CommerceSyncRun" ("activeKey");
CREATE INDEX "CommerceSyncRun_platform_createdAt_idx"
  ON "CommerceSyncRun" ("platform", "createdAt");
CREATE INDEX "CommerceSyncRun_status_nextAttemptAt_idx"
  ON "CommerceSyncRun" ("status", "nextAttemptAt");
CREATE INDEX "CommerceSyncRun_status_lockedAt_idx"
  ON "CommerceSyncRun" ("status", "lockedAt");
CREATE INDEX "CommerceSyncRun_integrationId_createdAt_idx"
  ON "CommerceSyncRun" ("integrationId", "createdAt");

CREATE UNIQUE INDEX "CommerceSyncPage_pageKey_key"
  ON "CommerceSyncPage" ("pageKey");
CREATE UNIQUE INDEX "CommerceSyncPage_runId_pageNumber_key"
  ON "CommerceSyncPage" ("runId", "pageNumber");
CREATE INDEX "CommerceSyncPage_runId_fetchedAt_idx"
  ON "CommerceSyncPage" ("runId", "fetchedAt");

CREATE UNIQUE INDEX "CommerceSyncItem_itemKey_key"
  ON "CommerceSyncItem" ("itemKey");
CREATE UNIQUE INDEX "CommerceSyncItem_runId_sourceOrderId_sourceRevision_key"
  ON "CommerceSyncItem" ("runId", "sourceOrderId", "sourceRevision");
CREATE INDEX "CommerceSyncItem_runId_status_createdAt_idx"
  ON "CommerceSyncItem" ("runId", "status", "createdAt");
CREATE INDEX "CommerceSyncItem_status_nextAttemptAt_idx"
  ON "CommerceSyncItem" ("status", "nextAttemptAt");
CREATE INDEX "CommerceSyncItem_status_lockedAt_idx"
  ON "CommerceSyncItem" ("status", "lockedAt");
CREATE INDEX "CommerceSyncItem_platform_sourceOrderId_idx"
  ON "CommerceSyncItem" ("platform", "sourceOrderId");

CREATE UNIQUE INDEX "CommerceSyncRunAttempt_runId_attemptNumber_phase_key"
  ON "CommerceSyncRunAttempt" ("runId", "attemptNumber", "phase");
CREATE INDEX "CommerceSyncRunAttempt_runId_startedAt_idx"
  ON "CommerceSyncRunAttempt" ("runId", "startedAt");
CREATE INDEX "CommerceSyncRunAttempt_state_startedAt_idx"
  ON "CommerceSyncRunAttempt" ("state", "startedAt");

CREATE UNIQUE INDEX "CommerceSyncItemAttempt_itemId_attemptNumber_key"
  ON "CommerceSyncItemAttempt" ("itemId", "attemptNumber");
CREATE INDEX "CommerceSyncItemAttempt_itemId_startedAt_idx"
  ON "CommerceSyncItemAttempt" ("itemId", "startedAt");
CREATE INDEX "CommerceSyncItemAttempt_state_startedAt_idx"
  ON "CommerceSyncItemAttempt" ("state", "startedAt");
