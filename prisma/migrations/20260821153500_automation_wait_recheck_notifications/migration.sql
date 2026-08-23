-- Automations V2: durable seller-visible Bell notifications.
--
-- Wait/re-check reuse AutomationRun/AutomationStepRun nextAttemptAt and lease
-- columns, so no scheduler table is added. This table owns only the exactly-once
-- visible notification effect produced by a successful automation step.

CREATE TABLE "AutomationNotification" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "notificationKey" TEXT NOT NULL,
  "automationId" TEXT NOT NULL,
  "automationName" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "stepRunId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "link" TEXT,
  "readAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AutomationNotification_runId_fkey"
    FOREIGN KEY ("runId") REFERENCES "AutomationRun" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AutomationNotification_notificationKey_key"
  ON "AutomationNotification"("notificationKey");
CREATE UNIQUE INDEX "AutomationNotification_stepRunId_key"
  ON "AutomationNotification"("stepRunId");
CREATE INDEX "AutomationNotification_readAt_createdAt_idx"
  ON "AutomationNotification"("readAt", "createdAt");
CREATE INDEX "AutomationNotification_automationId_createdAt_idx"
  ON "AutomationNotification"("automationId", "createdAt");
CREATE INDEX "AutomationNotification_runId_idx"
  ON "AutomationNotification"("runId");
