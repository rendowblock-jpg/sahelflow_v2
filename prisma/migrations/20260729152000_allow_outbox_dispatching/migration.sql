-- Preserve every existing outbox row while extending the status authority with
-- a durable dispatch-start state. `processing` means claimed but not dispatched;
-- `dispatching` means an effect may already have escaped and stale recovery must
-- fail closed instead of replaying it.
CREATE TABLE "new_OutboxIntent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "effectKey" TEXT NOT NULL,
    "commandId" TEXT NOT NULL,
    "effectType" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboxIntent_commandId_fkey"
        FOREIGN KEY ("commandId") REFERENCES "BusinessCommand"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OutboxIntent_status_check"
        CHECK ("status" IN (
            'queued',
            'processing',
            'dispatching',
            'retrying',
            'succeeded',
            'failed',
            'dead_letter'
        )),
    CONSTRAINT "OutboxIntent_attemptCount_check"
        CHECK ("attemptCount" >= 0)
);

INSERT INTO "new_OutboxIntent" (
    "id",
    "effectKey",
    "commandId",
    "effectType",
    "payloadJson",
    "status",
    "attemptCount",
    "nextAttemptAt",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    "effectKey",
    "commandId",
    "effectType",
    "payloadJson",
    "status",
    "attemptCount",
    "nextAttemptAt",
    "createdAt",
    "updatedAt"
FROM "OutboxIntent";

DROP TABLE "OutboxIntent";
ALTER TABLE "new_OutboxIntent" RENAME TO "OutboxIntent";

CREATE UNIQUE INDEX "OutboxIntent_effectKey_key"
    ON "OutboxIntent"("effectKey");
CREATE INDEX "OutboxIntent_status_nextAttemptAt_idx"
    ON "OutboxIntent"("status", "nextAttemptAt");
CREATE INDEX "OutboxIntent_commandId_idx"
    ON "OutboxIntent"("commandId");
