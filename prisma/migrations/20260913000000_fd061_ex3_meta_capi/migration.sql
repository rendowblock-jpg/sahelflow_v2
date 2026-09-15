-- FD-061 EX-3: Meta Pixel + Conversions API engine.
-- Contracts extracted from CodFlow (github.com/bighadj22/codflow @ 00f18fa,
-- Apache-2.0). The CAPI access token rides the encrypted Secret authority,
-- never this schema. Triggers ride the desktop outbox — never a Worker.

-- Placement tracking captured at storefront checkout (event_id dedup + user_data).
ALTER TABLE "Order" ADD COLUMN "fbc" TEXT;
ALTER TABLE "Order" ADD COLUMN "fbp" TEXT;
ALTER TABLE "Order" ADD COLUMN "clientIp" TEXT;
ALTER TABLE "Order" ADD COLUMN "userAgent" TEXT;

-- Per-shop Meta Pixel configuration (no row = CAPI disabled).
CREATE TABLE "MetaPixelConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pixelId" TEXT NOT NULL,
    "adAccountName" TEXT,
    "conversionEvent" TEXT NOT NULL DEFAULT 'Purchase',
    "testMode" BOOLEAN NOT NULL DEFAULT false,
    "testEventCode" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- Claim + outcome ledger: UNIQUE (order, stage, event) is the idempotency
-- authority; leaseUntil doubles as the exponential-backoff due time.
CREATE TABLE "CapiEventLedger" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'claimed',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "leaseUntil" DATETIME,
    "metaEventId" TEXT,
    "lastError" TEXT,
    "triggeredAt" DATETIME NOT NULL,
    "sentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CapiEventLedger_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CapiEventLedger_orderId_stage_eventName_key" ON "CapiEventLedger"("orderId", "stage", "eventName");
CREATE INDEX "CapiEventLedger_status_leaseUntil_idx" ON "CapiEventLedger"("status", "leaseUntil");
CREATE INDEX "CapiEventLedger_orderId_idx" ON "CapiEventLedger"("orderId");

-- Fire-and-forget audit row per attempt/outcome.
CREATE TABLE "CapiAttemptLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "httpStatus" INTEGER,
    "fbtraceId" TEXT,
    "error" TEXT,
    "status" TEXT NOT NULL,
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "CapiAttemptLog_orderId_sentAt_idx" ON "CapiAttemptLog"("orderId", "sentAt");
CREATE INDEX "CapiAttemptLog_sentAt_idx" ON "CapiAttemptLog"("sentAt");
