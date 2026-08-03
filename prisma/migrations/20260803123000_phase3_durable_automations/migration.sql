-- Phase 3: truthful durable automation runs, ordered steps and attempts.
--
-- This migration is append-only. Legacy Automation and AutomationLog tables
-- remain readable. Trigger/definition/config payloads are encrypted by the
-- application before persistence. Production definitions are soft-deleted;
-- the cascade chain exists for explicit test/dev hard cleanup only.

CREATE TABLE "AutomationRun" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "runKey" TEXT NOT NULL,
  "automationId" TEXT NOT NULL,
  "automationName" TEXT NOT NULL,
  "triggerIntentId" TEXT NOT NULL,
  "triggerEffectKey" TEXT NOT NULL,
  "triggerType" TEXT NOT NULL,
  "triggerKey" TEXT NOT NULL,
  "definitionHash" TEXT NOT NULL,
  "definitionJson" TEXT NOT NULL,
  "triggerPayloadJson" TEXT NOT NULL,
  "triggerPayloadHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "stepCount" INTEGER NOT NULL,
  "succeededStepCount" INTEGER NOT NULL DEFAULT 0,
  "failedStepCount" INTEGER NOT NULL DEFAULT 0,
  "skippedStepCount" INTEGER NOT NULL DEFAULT 0,
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
  CONSTRAINT "AutomationRun_automationId_fkey"
    FOREIGN KEY ("automationId") REFERENCES "Automation" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AutomationRun_runKey_key"
  ON "AutomationRun"("runKey");
CREATE UNIQUE INDEX "AutomationRun_automationId_triggerEffectKey_definitionHash_key"
  ON "AutomationRun"("automationId", "triggerEffectKey", "definitionHash");
CREATE INDEX "AutomationRun_status_nextAttemptAt_idx"
  ON "AutomationRun"("status", "nextAttemptAt");
CREATE INDEX "AutomationRun_status_lockedAt_idx"
  ON "AutomationRun"("status", "lockedAt");
CREATE INDEX "AutomationRun_automationId_createdAt_idx"
  ON "AutomationRun"("automationId", "createdAt");
CREATE INDEX "AutomationRun_triggerEffectKey_idx"
  ON "AutomationRun"("triggerEffectKey");
CREATE INDEX "AutomationRun_triggerType_createdAt_idx"
  ON "AutomationRun"("triggerType", "createdAt");

CREATE TABLE "AutomationStepRun" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "stepKey" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "action" TEXT NOT NULL,
  "failurePolicy" TEXT NOT NULL DEFAULT 'stop',
  "configJson" TEXT NOT NULL,
  "configHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "operatorRetryCount" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" DATETIME,
  "lockedAt" DATETIME,
  "leaseToken" TEXT,
  "lastErrorCode" TEXT,
  "effectKey" TEXT,
  "effectState" TEXT,
  "resultJson" TEXT,
  "startedAt" DATETIME,
  "completedAt" DATETIME,
  "deadLetteredAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AutomationStepRun_runId_fkey"
    FOREIGN KEY ("runId") REFERENCES "AutomationRun" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AutomationStepRun_stepKey_key"
  ON "AutomationStepRun"("stepKey");
CREATE UNIQUE INDEX "AutomationStepRun_runId_position_key"
  ON "AutomationStepRun"("runId", "position");
CREATE INDEX "AutomationStepRun_runId_status_position_idx"
  ON "AutomationStepRun"("runId", "status", "position");
CREATE INDEX "AutomationStepRun_status_nextAttemptAt_idx"
  ON "AutomationStepRun"("status", "nextAttemptAt");
CREATE INDEX "AutomationStepRun_status_lockedAt_idx"
  ON "AutomationStepRun"("status", "lockedAt");
CREATE INDEX "AutomationStepRun_effectKey_idx"
  ON "AutomationStepRun"("effectKey");

CREATE TABLE "AutomationStepAttempt" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "stepRunId" TEXT NOT NULL,
  "attemptNumber" INTEGER NOT NULL,
  "leaseToken" TEXT,
  "state" TEXT NOT NULL,
  "errorCode" TEXT,
  "detailJson" TEXT,
  "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AutomationStepAttempt_stepRunId_fkey"
    FOREIGN KEY ("stepRunId") REFERENCES "AutomationStepRun" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AutomationStepAttempt_stepRunId_attemptNumber_key"
  ON "AutomationStepAttempt"("stepRunId", "attemptNumber");
CREATE INDEX "AutomationStepAttempt_state_startedAt_idx"
  ON "AutomationStepAttempt"("state", "startedAt");
CREATE INDEX "AutomationStepAttempt_stepRunId_startedAt_idx"
  ON "AutomationStepAttempt"("stepRunId", "startedAt");
