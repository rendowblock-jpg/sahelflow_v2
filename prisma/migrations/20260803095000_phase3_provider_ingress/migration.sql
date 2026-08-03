-- Phase 3: durable authenticated provider ingress.
--
-- This migration is append-only. It does not rewrite the protected outbound
-- WhatsApp migration or existing Conversation/Message rows. Raw provider
-- evidence is encrypted by the application before it enters payloadJson.

CREATE TABLE "ProviderIngressEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "ingressKey" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "environment" TEXT NOT NULL,
  "providerAccountHash" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "providerEventId" TEXT NOT NULL,
  "payloadJson" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'received',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" DATETIME,
  "lockedAt" DATETIME,
  "leaseToken" TEXT,
  "lastErrorCode" TEXT,
  "providerTimestamp" DATETIME,
  "conversationId" TEXT,
  "messageId" TEXT,
  "appliedAt" DATETIME,
  "quarantinedAt" DATETIME,
  "deadLetteredAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "ProviderIngressEvent_ingressKey_key"
  ON "ProviderIngressEvent"("ingressKey");
CREATE UNIQUE INDEX "ProviderIngressEvent_provider_environment_providerAccountHash_sourceId_providerEventId_key"
  ON "ProviderIngressEvent"(
    "provider",
    "environment",
    "providerAccountHash",
    "sourceId",
    "providerEventId"
  );
CREATE INDEX "ProviderIngressEvent_provider_status_nextAttemptAt_idx"
  ON "ProviderIngressEvent"("provider", "status", "nextAttemptAt");
CREATE INDEX "ProviderIngressEvent_status_lockedAt_idx"
  ON "ProviderIngressEvent"("status", "lockedAt");
CREATE INDEX "ProviderIngressEvent_sourceId_providerTimestamp_idx"
  ON "ProviderIngressEvent"("sourceId", "providerTimestamp");
CREATE INDEX "ProviderIngressEvent_conversationId_providerTimestamp_idx"
  ON "ProviderIngressEvent"("conversationId", "providerTimestamp");
CREATE INDEX "ProviderIngressEvent_messageId_idx"
  ON "ProviderIngressEvent"("messageId");

CREATE TABLE "ProviderIngressAttempt" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "ingressEventId" TEXT NOT NULL,
  "attemptNumber" INTEGER NOT NULL,
  "leaseToken" TEXT,
  "state" TEXT NOT NULL,
  "errorCode" TEXT,
  "detailJson" TEXT,
  "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProviderIngressAttempt_ingressEventId_fkey"
    FOREIGN KEY ("ingressEventId") REFERENCES "ProviderIngressEvent" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ProviderIngressAttempt_ingressEventId_attemptNumber_key"
  ON "ProviderIngressAttempt"("ingressEventId", "attemptNumber");
CREATE INDEX "ProviderIngressAttempt_state_startedAt_idx"
  ON "ProviderIngressAttempt"("state", "startedAt");
CREATE INDEX "ProviderIngressAttempt_ingressEventId_startedAt_idx"
  ON "ProviderIngressAttempt"("ingressEventId", "startedAt");
