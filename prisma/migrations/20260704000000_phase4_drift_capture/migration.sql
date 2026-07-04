-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN "actor" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "after" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "before" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "entity" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "entityId" TEXT;

-- AlterTable
ALTER TABLE "Automation" ADD COLUMN "conditions" TEXT;
ALTER TABLE "Automation" ADD COLUMN "config" TEXT;
ALTER TABLE "Automation" ADD COLUMN "deletedAt" DATETIME;
ALTER TABLE "Automation" ADD COLUMN "steps" TEXT;

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN "deletedAt" DATETIME;

-- AlterTable
ALTER TABLE "Delivery" ADD COLUMN "deletedAt" DATETIME;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "deletedAt" DATETIME;

-- AlterTable
ALTER TABLE "Return" ADD COLUMN "deletedAt" DATETIME;

-- CreateTable
CREATE TABLE "AutomationLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "automationId" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "payload" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AutomationLog_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "Automation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExtractionMetric" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "messageId" TEXT,
    "method" TEXT NOT NULL,
    "confidence" REAL NOT NULL,
    "isComplete" BOOLEAN NOT NULL,
    "missingFields" TEXT,
    "fieldAccuracy" TEXT,
    "latencyMs" INTEGER NOT NULL,
    "modelVersion" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "OrderChange" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'confirmed',
    "actionType" TEXT NOT NULL,
    "actor" TEXT NOT NULL DEFAULT 'user',
    "payload" TEXT,
    "confirmedBy" TEXT,
    "declinedBy" TEXT,
    "declinedReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" DATETIME,
    CONSTRAINT "OrderChange_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "reason" TEXT,
    "returnId" TEXT,
    "createdBy" TEXT NOT NULL DEFAULT 'user',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Refund_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReservationItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" DATETIME,
    CONSTRAINT "ReservationItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReservationItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CannedResponse" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shortCode" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Conversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "channel" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "contactPhone" TEXT,
    "sourceId" TEXT,
    "lastMessageAt" DATETIME,
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'open',
    "assigneeId" TEXT,
    "priority" TEXT,
    "teamId" TEXT,
    "waitingSince" DATETIME,
    "firstReplyAt" DATETIME,
    "snoozedUntil" DATETIME,
    "labels" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Conversation" ("channel", "contactName", "contactPhone", "createdAt", "id", "lastMessageAt", "sourceId", "unreadCount", "updatedAt") SELECT "channel", "contactName", "contactPhone", "createdAt", "id", "lastMessageAt", "sourceId", "unreadCount", "updatedAt" FROM "Conversation";
DROP TABLE "Conversation";
ALTER TABLE "new_Conversation" RENAME TO "Conversation";
CREATE INDEX "Conversation_channel_idx" ON "Conversation"("channel");
CREATE INDEX "Conversation_lastMessageAt_idx" ON "Conversation"("lastMessageAt");
CREATE INDEX "Conversation_status_idx" ON "Conversation"("status");
CREATE INDEX "Conversation_assigneeId_idx" ON "Conversation"("assigneeId");
CREATE INDEX "Conversation_priority_idx" ON "Conversation"("priority");
CREATE TABLE "new_Message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL,
    "extractedOrderJson" TEXT,
    "extractionMethod" TEXT,
    "deliveryStatus" TEXT DEFAULT 'sent',
    "messageType" TEXT NOT NULL DEFAULT 'text',
    "activityType" TEXT,
    "attachments" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Message" ("body", "conversationId", "createdAt", "direction", "extractedOrderJson", "extractionMethod", "id", "timestamp") SELECT "body", "conversationId", "createdAt", "direction", "extractedOrderJson", "extractionMethod", "id", "timestamp" FROM "Message";
DROP TABLE "Message";
ALTER TABLE "new_Message" RENAME TO "Message";
CREATE INDEX "Message_conversationId_timestamp_idx" ON "Message"("conversationId", "timestamp");
CREATE INDEX "Message_deliveryStatus_idx" ON "Message"("deliveryStatus");
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
    CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Order" ("address", "commune", "confirmedAt", "createdAt", "customerId", "deliveredAt", "deliveryCost", "id", "notes", "orderNumber", "phone", "phoneBlindIndex", "shippedAt", "source", "sourceMetadata", "status", "totalPrice", "updatedAt", "wilaya") SELECT "address", "commune", "confirmedAt", "createdAt", "customerId", "deliveredAt", "deliveryCost", "id", "notes", "orderNumber", "phone", "phoneBlindIndex", "shippedAt", "source", "sourceMetadata", "status", "totalPrice", "updatedAt", "wilaya" FROM "Order";
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
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");
CREATE UNIQUE INDEX "Order_source_sourceOrderId_key" ON "Order"("source", "sourceOrderId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "AutomationLog_automationId_idx" ON "AutomationLog"("automationId");

-- CreateIndex
CREATE INDEX "AutomationLog_status_idx" ON "AutomationLog"("status");

-- CreateIndex
CREATE INDEX "AutomationLog_createdAt_idx" ON "AutomationLog"("createdAt");

-- CreateIndex
CREATE INDEX "ExtractionMetric_method_createdAt_idx" ON "ExtractionMetric"("method", "createdAt");

-- CreateIndex
CREATE INDEX "ExtractionMetric_createdAt_idx" ON "ExtractionMetric"("createdAt");

-- CreateIndex
CREATE INDEX "OrderChange_orderId_createdAt_idx" ON "OrderChange"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "OrderChange_actionType_createdAt_idx" ON "OrderChange"("actionType", "createdAt");

-- CreateIndex
CREATE INDEX "Refund_orderId_createdAt_idx" ON "Refund"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "Refund_returnId_idx" ON "Refund"("returnId");

-- CreateIndex
CREATE INDEX "ReservationItem_productId_idx" ON "ReservationItem"("productId");

-- CreateIndex
CREATE INDEX "ReservationItem_orderId_idx" ON "ReservationItem"("orderId");

-- CreateIndex
CREATE INDEX "ReservationItem_releasedAt_idx" ON "ReservationItem"("releasedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CannedResponse_shortCode_key" ON "CannedResponse"("shortCode");

-- CreateIndex
CREATE INDEX "CannedResponse_shortCode_idx" ON "CannedResponse"("shortCode");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_createdAt_idx" ON "AuditLog"("entity", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "Automation_deletedAt_idx" ON "Automation"("deletedAt");

-- CreateIndex
CREATE INDEX "Customer_deletedAt_idx" ON "Customer"("deletedAt");

-- CreateIndex
CREATE INDEX "Delivery_trackingNumber_idx" ON "Delivery"("trackingNumber");

-- CreateIndex
CREATE INDEX "Delivery_createdAt_idx" ON "Delivery"("createdAt");

-- CreateIndex
CREATE INDEX "Delivery_deletedAt_idx" ON "Delivery"("deletedAt");

-- CreateIndex
CREATE INDEX "Product_deletedAt_idx" ON "Product"("deletedAt");

-- CreateIndex
CREATE INDEX "Return_createdAt_idx" ON "Return"("createdAt");

-- CreateIndex
CREATE INDEX "Return_deletedAt_idx" ON "Return"("deletedAt");

