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
    "dryRun" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" DATETIME
);
INSERT INTO "new_Automation" ("action", "conditions", "config", "createdAt", "deletedAt", "id", "isActive", "lastError", "lastRunAt", "maxRetries", "name", "nextRunAt", "retryCount", "retryDelayMs", "runCount", "steps", "trigger", "updatedAt") SELECT "action", "conditions", "config", "createdAt", "deletedAt", "id", "isActive", "lastError", "lastRunAt", "maxRetries", "name", "nextRunAt", "retryCount", "retryDelayMs", "runCount", "steps", "trigger", "updatedAt" FROM "Automation";
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
    "reversed" BOOLEAN NOT NULL DEFAULT false,
    "reversedAt" DATETIME,
    CONSTRAINT "Refund_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Refund" ("amount", "createdAt", "createdBy", "id", "idempotencyKey", "method", "orderId", "processedAt", "reason", "reference", "returnId", "status") SELECT "amount", "createdAt", "createdBy", "id", "idempotencyKey", "method", "orderId", "processedAt", "reason", "reference", "returnId", "status" FROM "Refund";
DROP TABLE "Refund";
ALTER TABLE "new_Refund" RENAME TO "Refund";
CREATE UNIQUE INDEX "Refund_idempotencyKey_key" ON "Refund"("idempotencyKey");
CREATE INDEX "Refund_orderId_createdAt_idx" ON "Refund"("orderId", "createdAt");
CREATE INDEX "Refund_returnId_idx" ON "Refund"("returnId");
CREATE INDEX "Refund_status_idx" ON "Refund"("status");
CREATE INDEX "Refund_reversed_idx" ON "Refund"("reversed");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Customer_wilaya_isBlacklisted_idx" ON "Customer"("wilaya", "isBlacklisted");

-- CreateIndex
CREATE INDEX "Customer_isBlacklisted_totalSpent_idx" ON "Customer"("isBlacklisted", "totalSpent");

-- CreateIndex
CREATE INDEX "Customer_createdAt_deletedAt_idx" ON "Customer"("createdAt", "deletedAt");

-- CreateIndex
CREATE INDEX "Delivery_status_createdAt_idx" ON "Delivery"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Delivery_provider_status_idx" ON "Delivery"("provider", "status");

-- CreateIndex
CREATE INDEX "Delivery_createdAt_deletedAt_idx" ON "Delivery"("createdAt", "deletedAt");

-- CreateIndex
CREATE INDEX "Order_status_createdAt_deletedAt_idx" ON "Order"("status", "createdAt", "deletedAt");

-- CreateIndex
CREATE INDEX "Order_customerId_createdAt_idx" ON "Order"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_source_status_idx" ON "Order"("source", "status");

-- CreateIndex
CREATE INDEX "Product_isActive_deletedAt_idx" ON "Product"("isActive", "deletedAt");

-- CreateIndex
CREATE INDEX "Product_stock_lowStockThreshold_idx" ON "Product"("stock", "lowStockThreshold");

-- CreateIndex
CREATE INDEX "Product_categoryId_isActive_idx" ON "Product"("categoryId", "isActive");

