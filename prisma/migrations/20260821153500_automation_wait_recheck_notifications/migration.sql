-- Automations V2: durable seller-visible Bell notifications.
--
-- Wait/re-check reuse AutomationRun/AutomationStepRun nextAttemptAt and lease
-- columns, so no scheduler table is added. This table owns only the exactly-once
-- visible notification effect produced by a successful automation step.
-- triggerType is retained so the Bell projection can re-enforce the originating
-- data domain's read permission before exposing a rendered message.

CREATE TABLE "AutomationNotification" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "notificationKey" TEXT NOT NULL,
  "automationId" TEXT NOT NULL,
  "automationName" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "stepRunId" TEXT NOT NULL,
  "triggerType" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "link" TEXT,
  "readAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "AutomationNotification_notificationKey_key"
  ON "AutomationNotification"("notificationKey");
CREATE UNIQUE INDEX "AutomationNotification_stepRunId_key"
  ON "AutomationNotification"("stepRunId");
CREATE INDEX "AutomationNotification_readAt_createdAt_idx"
  ON "AutomationNotification"("readAt", "createdAt");
CREATE INDEX "AutomationNotification_automationId_createdAt_idx"
  ON "AutomationNotification"("automationId", "createdAt");
CREATE INDEX "AutomationNotification_triggerType_createdAt_idx"
  ON "AutomationNotification"("triggerType", "createdAt");
