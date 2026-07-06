-- DropIndex
DROP INDEX "PollingEvent_source_processed_idx";

-- DropIndex
DROP INDEX "PollingEvent_eventId_key";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "PollingEvent";
PRAGMA foreign_keys=on;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "customerId" TEXT NOT NULL,
    "totalPrice" INTEGER NOT NULL,
    "deliveryCost" INTEGER,
    "wilaya" TEXT NOT NULL,
    "commune" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "phoneBlindIndex" TEXT,
    "source" TEXT NOT NULL DEFAULT 'whatsapp',
    "sourceOrderId" TEXT,
    "sourceMetadata" TEXT,
    "notes" TEXT,
    "confirmedAt" DATETIME,
    "shippedAt" DATETIME,
    "deliveredAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "codCollected" BOOLEAN,
    "codCollectedAt" DATETIME,
    "codRemitted" BOOLEAN,
    "codRemittedAt" DATETIME,
    "codRemittanceRef" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deletedAt" DATETIME,
    CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Order" ("address", "codCollected", "codCollectedAt", "codRemittanceRef", "codRemitted", "codRemittedAt", "commune", "confirmedAt", "createdAt", "customerId", "deletedAt", "deliveredAt", "deliveryCost", "id", "notes", "orderNumber", "phone", "phoneBlindIndex", "shippedAt", "source", "sourceMetadata", "sourceOrderId", "status", "totalPrice", "updatedAt", "version", "wilaya") SELECT "address", "codCollected", "codCollectedAt", "codRemittanceRef", "codRemitted", "codRemittedAt", "commune", "confirmedAt", "createdAt", "customerId", "deletedAt", "deliveredAt", "deliveryCost", "id", "notes", "orderNumber", "phone", "phoneBlindIndex", "shippedAt", "source", "sourceMetadata", "sourceOrderId", "status", "totalPrice", "updatedAt", "version", "wilaya" FROM "Order";
DROP TABLE "Order";
ALTER TABLE "new_Order" RENAME TO "Order";
CREATE INDEX "Order_status_idx" ON "Order"("status");
CREATE INDEX "Order_source_idx" ON "Order"("source");
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");
CREATE INDEX "Order_phoneBlindIndex_idx" ON "Order"("phoneBlindIndex");
CREATE INDEX "Order_customerId_idx" ON "Order"("customerId");
CREATE INDEX "Order_deletedAt_idx" ON "Order"("deletedAt");
CREATE INDEX "Order_codRemitted_idx" ON "Order"("codRemitted");
CREATE INDEX "Order_codCollected_idx" ON "Order"("codCollected");
CREATE INDEX "Order_wilaya_idx" ON "Order"("wilaya");
CREATE INDEX "Order_deliveredAt_idx" ON "Order"("deliveredAt");
CREATE INDEX "Order_confirmedAt_idx" ON "Order"("confirmedAt");
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");
CREATE UNIQUE INDEX "Order_source_sourceOrderId_key" ON "Order"("source", "sourceOrderId");
CREATE TABLE "new_Return" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "type" TEXT NOT NULL,
    "exchangeOrderId" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "Return_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Return" ("createdAt", "deletedAt", "exchangeOrderId", "id", "notes", "orderId", "reason", "status", "type", "updatedAt") SELECT "createdAt", "deletedAt", "exchangeOrderId", "id", "notes", "orderId", "reason", "status", "type", "updatedAt" FROM "Return";
DROP TABLE "Return";
ALTER TABLE "new_Return" RENAME TO "Return";
CREATE INDEX "Return_orderId_idx" ON "Return"("orderId");
CREATE INDEX "Return_status_idx" ON "Return"("status");
CREATE INDEX "Return_createdAt_idx" ON "Return"("createdAt");
CREATE INDEX "Return_deletedAt_idx" ON "Return"("deletedAt");
CREATE INDEX "Return_exchangeOrderId_idx" ON "Return"("exchangeOrderId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Conversation_sourceId_idx" ON "Conversation"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_channel_sourceId_key" ON "Conversation"("channel", "sourceId");

