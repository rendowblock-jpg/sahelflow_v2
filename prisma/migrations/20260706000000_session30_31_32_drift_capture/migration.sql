-- DropIndex
DROP INDEX "ReservationItem_releasedAt_idx";

-- DropIndex
DROP INDEX "ReservationItem_orderId_idx";

-- DropIndex
DROP INDEX "ReservationItem_productId_idx";

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN "deletedAt" DATETIME;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "ReservationItem";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "PhoneReputation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "phoneHash" TEXT NOT NULL,
    "last4" TEXT,
    "reportCount" INTEGER NOT NULL DEFAULT 1,
    "severity" TEXT NOT NULL DEFAULT 'bad',
    "reportedBy" TEXT,
    "notes" TEXT,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Automation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "config" TEXT,
    "conditions" TEXT,
    "steps" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "runCount" INTEGER NOT NULL DEFAULT 0,
    "lastRunAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "maxRetries" INTEGER NOT NULL DEFAULT 2,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "retryDelayMs" INTEGER NOT NULL DEFAULT 500,
    "lastError" TEXT,
    "nextRunAt" DATETIME,
    "deletedAt" DATETIME
);
INSERT INTO "new_Automation" ("action", "conditions", "config", "createdAt", "deletedAt", "id", "isActive", "lastRunAt", "name", "runCount", "steps", "trigger", "updatedAt") SELECT "action", "conditions", "config", "createdAt", "deletedAt", "id", "isActive", "lastRunAt", "name", "runCount", "steps", "trigger", "updatedAt" FROM "Automation";
DROP TABLE "Automation";
ALTER TABLE "new_Automation" RENAME TO "Automation";
CREATE INDEX "Automation_isActive_idx" ON "Automation"("isActive");
CREATE INDEX "Automation_trigger_idx" ON "Automation"("trigger");
CREATE INDEX "Automation_nextRunAt_idx" ON "Automation"("nextRunAt");
CREATE INDEX "Automation_deletedAt_idx" ON "Automation"("deletedAt");
CREATE TABLE "new_Refund" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "reason" TEXT,
    "returnId" TEXT,
    "createdBy" TEXT NOT NULL DEFAULT 'user',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "idempotencyKey" TEXT,
    "processedAt" DATETIME,
    "reference" TEXT,
    CONSTRAINT "Refund_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Refund" ("amount", "createdAt", "createdBy", "id", "method", "orderId", "reason", "returnId") SELECT "amount", "createdAt", "createdBy", "id", "method", "orderId", "reason", "returnId" FROM "Refund";
DROP TABLE "Refund";
ALTER TABLE "new_Refund" RENAME TO "Refund";
CREATE UNIQUE INDEX "Refund_idempotencyKey_key" ON "Refund"("idempotencyKey");
CREATE INDEX "Refund_orderId_createdAt_idx" ON "Refund"("orderId", "createdAt");
CREATE INDEX "Refund_returnId_idx" ON "Refund"("returnId");
CREATE INDEX "Refund_status_idx" ON "Refund"("status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "PhoneReputation_phoneHash_key" ON "PhoneReputation"("phoneHash");

-- CreateIndex
CREATE INDEX "PhoneReputation_severity_idx" ON "PhoneReputation"("severity");

-- CreateIndex
CREATE INDEX "PhoneReputation_lastSeenAt_idx" ON "PhoneReputation"("lastSeenAt");

-- CreateIndex
CREATE INDEX "Conversation_snoozedUntil_idx" ON "Conversation"("snoozedUntil");

-- CreateIndex
CREATE INDEX "Conversation_waitingSince_idx" ON "Conversation"("waitingSince");

-- CreateIndex
CREATE INDEX "Expense_deletedAt_idx" ON "Expense"("deletedAt");

-- CreateIndex
CREATE INDEX "ExtractionMetric_messageId_idx" ON "ExtractionMetric"("messageId");

-- CreateIndex
CREATE INDEX "Order_wilaya_idx" ON "Order"("wilaya");

-- CreateIndex
CREATE INDEX "Order_deliveredAt_idx" ON "Order"("deliveredAt");

-- CreateIndex
CREATE INDEX "Order_confirmedAt_idx" ON "Order"("confirmedAt");

-- CreateIndex
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");

-- CreateIndex
CREATE INDEX "Return_exchangeOrderId_idx" ON "Return"("exchangeOrderId");

