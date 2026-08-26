-- FD-048 / FRC Notifications: durable per-actor lifecycle and recoverable
-- channel delivery without storing message/contact PII in notification rows.

CREATE TABLE "NotificationEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "eventKey" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "requiredAction" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "sourceRecordId" TEXT NOT NULL,
  "link" TEXT NOT NULL,
  "occurredAt" DATETIME NOT NULL,
  "expiresAt" DATETIME NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "OperationalNotification" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "dedupeKey" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "recipientMemberId" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "titleKey" TEXT NOT NULL,
  "bodyKey" TEXT NOT NULL,
  "link" TEXT NOT NULL,
  "readAt" DATETIME,
  "archivedAt" DATETIME,
  "lastRecoveredAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OperationalNotification_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "NotificationEvent" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "NotificationPreference" (
  "recipientMemberId" TEXT NOT NULL PRIMARY KEY,
  "categorySettings" TEXT NOT NULL DEFAULT '{"inbox":true}',
  "nativeEnabled" BOOLEAN NOT NULL DEFAULT false,
  "soundEnabled" BOOLEAN NOT NULL DEFAULT false,
  "previewEnabled" BOOLEAN NOT NULL DEFAULT false,
  "quietStartMinute" INTEGER,
  "quietEndMinute" INTEGER,
  "mutedUntil" DATETIME,
  "retentionDays" INTEGER NOT NULL DEFAULT 90,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "NotificationDeliveryAttempt" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "attemptKey" TEXT NOT NULL,
  "notificationId" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "reasonCode" TEXT,
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" DATETIME,
  "attemptedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" DATETIME,
  CONSTRAINT "NotificationDeliveryAttempt_notificationId_fkey"
    FOREIGN KEY ("notificationId") REFERENCES "OperationalNotification" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "NotificationEvent_eventKey_key" ON "NotificationEvent"("eventKey");
CREATE INDEX "NotificationEvent_category_occurredAt_id_idx" ON "NotificationEvent"("category", "occurredAt", "id");
CREATE INDEX "NotificationEvent_requiredAction_occurredAt_id_idx" ON "NotificationEvent"("requiredAction", "occurredAt", "id");
CREATE INDEX "NotificationEvent_expiresAt_idx" ON "NotificationEvent"("expiresAt");

CREATE UNIQUE INDEX "OperationalNotification_dedupeKey_key" ON "OperationalNotification"("dedupeKey");
CREATE UNIQUE INDEX "OperationalNotification_eventId_recipientMemberId_key" ON "OperationalNotification"("eventId", "recipientMemberId");
CREATE INDEX "OperationalNotification_recipientMemberId_archivedAt_createdAt_id_idx" ON "OperationalNotification"("recipientMemberId", "archivedAt", "createdAt", "id");
CREATE INDEX "OperationalNotification_recipientMemberId_readAt_createdAt_id_idx" ON "OperationalNotification"("recipientMemberId", "readAt", "createdAt", "id");
CREATE INDEX "OperationalNotification_recipientMemberId_category_severity_createdAt_id_idx" ON "OperationalNotification"("recipientMemberId", "category", "severity", "createdAt", "id");

CREATE UNIQUE INDEX "NotificationDeliveryAttempt_attemptKey_key" ON "NotificationDeliveryAttempt"("attemptKey");
CREATE INDEX "NotificationDeliveryAttempt_notificationId_channel_state_idx" ON "NotificationDeliveryAttempt"("notificationId", "channel", "state");
CREATE INDEX "NotificationDeliveryAttempt_state_attemptedAt_idx" ON "NotificationDeliveryAttempt"("state", "attemptedAt");
CREATE INDEX "NotificationDeliveryAttempt_state_nextAttemptAt_idx" ON "NotificationDeliveryAttempt"("state", "nextAttemptAt");
