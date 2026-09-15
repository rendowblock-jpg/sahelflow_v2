-- FD-061 EX-4 (slice 1): abandoned-cart recovery ledger.
-- Contracts extracted from CodFlow (github.com/bighadj22/codflow @ 00f18fa,
-- Apache-2.0). Per-session capture upsert; the 30-minute sweep marks stale
-- pending rows abandoned; conversion is terminal and idempotent. Revenue
-- columns are recovery estimates — never money truth.

CREATE TABLE "AbandonedCart" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storefrontSlug" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "wilaya" TEXT,
    "commune" TEXT,
    "address" TEXT,
    "itemsJson" TEXT NOT NULL,
    "itemCount" INTEGER NOT NULL,
    "totalPrice" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "abandonedAt" DATETIME,
    "convertedAt" DATETIME,
    "convertedOrderId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "AbandonedCart_storefrontSlug_sessionId_key" ON "AbandonedCart"("storefrontSlug", "sessionId");
CREATE INDEX "AbandonedCart_status_capturedAt_idx" ON "AbandonedCart"("status", "capturedAt");
CREATE INDEX "AbandonedCart_storefrontSlug_idx" ON "AbandonedCart"("storefrontSlug");
