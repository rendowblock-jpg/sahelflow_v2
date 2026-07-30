-- Phase 1C/E: canonical cancellation, delivery exception, physical return and
-- inventory/financial compensation authority.

ALTER TABLE "Order" ADD COLUMN "returnState" TEXT;
ALTER TABLE "Order" ADD COLUMN "refundState" TEXT;

CREATE INDEX "Order_returnState_idx" ON "Order"("returnState");
CREATE INDEX "Order_refundState_idx" ON "Order"("refundState");

DROP TRIGGER IF EXISTS "Order_canonical_lifecycle_insert_check";
DROP TRIGGER IF EXISTS "Order_canonical_lifecycle_update_check";

CREATE TRIGGER "Order_canonical_lifecycle_insert_check"
BEFORE INSERT ON "Order"
FOR EACH ROW
WHEN
  (NEW."fulfillmentState" IS NOT NULL AND NEW."fulfillmentState" NOT IN ('unfulfilled', 'preparing', 'ready', 'shipped', 'closed')) OR
  (NEW."deliveryState" IS NOT NULL AND NEW."deliveryState" NOT IN ('not_created', 'pending', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'failed', 'refused', 'return_in_transit', 'returned')) OR
  (NEW."inventoryState" IS NOT NULL AND NEW."inventoryState" NOT IN ('unreserved', 'reserved', 'outbound', 'return_pending_receipt', 'return_pending_inspection', 'settled')) OR
  (NEW."codState" IS NOT NULL AND NEW."codState" NOT IN ('not_expected', 'receivable', 'collected', 'partially_remitted', 'remitted', 'disputed', 'partially_refunded', 'refunded', 'corrected')) OR
  (NEW."returnState" IS NOT NULL AND NEW."returnState" NOT IN ('none', 'awaiting_return', 'requested', 'approved', 'rejected', 'cancelled', 'in_transit', 'received', 'inspected', 'completed')) OR
  (NEW."refundState" IS NOT NULL AND NEW."refundState" NOT IN ('none', 'pending', 'partially_refunded', 'refunded', 'partially_reversed', 'reversed'))
BEGIN
  SELECT RAISE(ABORT, 'invalid canonical order lifecycle state');
END;

CREATE TRIGGER "Order_canonical_lifecycle_update_check"
BEFORE UPDATE OF "fulfillmentState", "deliveryState", "inventoryState", "codState", "returnState", "refundState" ON "Order"
FOR EACH ROW
WHEN
  (NEW."fulfillmentState" IS NOT NULL AND NEW."fulfillmentState" NOT IN ('unfulfilled', 'preparing', 'ready', 'shipped', 'closed')) OR
  (NEW."deliveryState" IS NOT NULL AND NEW."deliveryState" NOT IN ('not_created', 'pending', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'failed', 'refused', 'return_in_transit', 'returned')) OR
  (NEW."inventoryState" IS NOT NULL AND NEW."inventoryState" NOT IN ('unreserved', 'reserved', 'outbound', 'return_pending_receipt', 'return_pending_inspection', 'settled')) OR
  (NEW."codState" IS NOT NULL AND NEW."codState" NOT IN ('not_expected', 'receivable', 'collected', 'partially_remitted', 'remitted', 'disputed', 'partially_refunded', 'refunded', 'corrected')) OR
  (NEW."returnState" IS NOT NULL AND NEW."returnState" NOT IN ('none', 'awaiting_return', 'requested', 'approved', 'rejected', 'cancelled', 'in_transit', 'received', 'inspected', 'completed')) OR
  (NEW."refundState" IS NOT NULL AND NEW."refundState" NOT IN ('none', 'pending', 'partially_refunded', 'refunded', 'partially_reversed', 'reversed'))
BEGIN
  SELECT RAISE(ABORT, 'invalid canonical order lifecycle state');
END;

CREATE TABLE "CanonicalDeliveryEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "eventKey" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "deliveryId" TEXT,
  "eventType" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerEventId" TEXT,
  "reasonCode" TEXT NOT NULL,
  "occurredAt" DATETIME NOT NULL,
  "createdByCommandId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CanonicalDeliveryEvent_order_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CanonicalDeliveryEvent_delivery_fkey"
    FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CanonicalDeliveryEvent_command_fkey"
    FOREIGN KEY ("createdByCommandId") REFERENCES "BusinessCommand"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CanonicalDeliveryEvent_eventKey_key" ON "CanonicalDeliveryEvent"("eventKey");
CREATE UNIQUE INDEX "CanonicalDeliveryEvent_createdByCommandId_key" ON "CanonicalDeliveryEvent"("createdByCommandId");
CREATE UNIQUE INDEX "CanonicalDeliveryEvent_provider_providerEventId_key" ON "CanonicalDeliveryEvent"("provider", "providerEventId");
CREATE INDEX "CanonicalDeliveryEvent_orderId_occurredAt_idx" ON "CanonicalDeliveryEvent"("orderId", "occurredAt");
CREATE INDEX "CanonicalDeliveryEvent_deliveryId_occurredAt_idx" ON "CanonicalDeliveryEvent"("deliveryId", "occurredAt");
CREATE INDEX "CanonicalDeliveryEvent_eventType_occurredAt_idx" ON "CanonicalDeliveryEvent"("eventType", "occurredAt");

CREATE TABLE "CanonicalReturnCase" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "returnKey" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "origin" TEXT NOT NULL,
  "caseType" TEXT NOT NULL DEFAULT 'return',
  "currentState" TEXT NOT NULL,
  "reasonCode" TEXT NOT NULL,
  "createdByCommandId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CanonicalReturnCase_order_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CanonicalReturnCase_command_fkey"
    FOREIGN KEY ("createdByCommandId") REFERENCES "BusinessCommand"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CanonicalReturnCase_origin_check" CHECK ("origin" IN ('delivery_failure', 'delivery_refusal', 'customer_return')),
  CONSTRAINT "CanonicalReturnCase_type_check" CHECK ("caseType" IN ('return', 'exchange')),
  CONSTRAINT "CanonicalReturnCase_state_check" CHECK ("currentState" IN ('awaiting_return', 'requested', 'approved', 'rejected', 'cancelled', 'in_transit', 'received', 'inspected', 'completed'))
);

CREATE UNIQUE INDEX "CanonicalReturnCase_returnKey_key" ON "CanonicalReturnCase"("returnKey");
CREATE UNIQUE INDEX "CanonicalReturnCase_orderId_key" ON "CanonicalReturnCase"("orderId");
CREATE UNIQUE INDEX "CanonicalReturnCase_createdByCommandId_key" ON "CanonicalReturnCase"("createdByCommandId");
CREATE INDEX "CanonicalReturnCase_currentState_updatedAt_idx" ON "CanonicalReturnCase"("currentState", "updatedAt");
CREATE INDEX "CanonicalReturnCase_origin_createdAt_idx" ON "CanonicalReturnCase"("origin", "createdAt");

CREATE TABLE "CanonicalReturnEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "eventKey" TEXT NOT NULL,
  "returnId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "fromState" TEXT,
  "toState" TEXT NOT NULL,
  "reasonCode" TEXT NOT NULL,
  "occurredAt" DATETIME NOT NULL,
  "createdByCommandId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CanonicalReturnEvent_return_fkey"
    FOREIGN KEY ("returnId") REFERENCES "CanonicalReturnCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CanonicalReturnEvent_order_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CanonicalReturnEvent_command_fkey"
    FOREIGN KEY ("createdByCommandId") REFERENCES "BusinessCommand"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CanonicalReturnEvent_eventKey_key" ON "CanonicalReturnEvent"("eventKey");
CREATE UNIQUE INDEX "CanonicalReturnEvent_createdByCommandId_key" ON "CanonicalReturnEvent"("createdByCommandId");
CREATE INDEX "CanonicalReturnEvent_returnId_occurredAt_idx" ON "CanonicalReturnEvent"("returnId", "occurredAt");
CREATE INDEX "CanonicalReturnEvent_orderId_occurredAt_idx" ON "CanonicalReturnEvent"("orderId", "occurredAt");
CREATE INDEX "CanonicalReturnEvent_eventType_occurredAt_idx" ON "CanonicalReturnEvent"("eventType", "occurredAt");

CREATE TABLE "CanonicalReturnInspection" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "inspectionKey" TEXT NOT NULL,
  "returnId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "orderItemId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "productVariantId" TEXT,
  "quantity" INTEGER NOT NULL,
  "disposition" TEXT NOT NULL,
  "unitCost" INTEGER,
  "lossAmount" INTEGER,
  "reasonCode" TEXT NOT NULL,
  "occurredAt" DATETIME NOT NULL,
  "createdByCommandId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CanonicalReturnInspection_return_fkey"
    FOREIGN KEY ("returnId") REFERENCES "CanonicalReturnCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CanonicalReturnInspection_order_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CanonicalReturnInspection_item_fkey"
    FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CanonicalReturnInspection_command_fkey"
    FOREIGN KEY ("createdByCommandId") REFERENCES "BusinessCommand"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CanonicalReturnInspection_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "CanonicalReturnInspection_disposition_check" CHECK ("disposition" IN ('available', 'damaged', 'quarantine', 'lost')),
  CONSTRAINT "CanonicalReturnInspection_cost_check" CHECK ("unitCost" IS NULL OR "unitCost" >= 0),
  CONSTRAINT "CanonicalReturnInspection_loss_check" CHECK ("lossAmount" IS NULL OR "lossAmount" >= 0)
);

CREATE UNIQUE INDEX "CanonicalReturnInspection_inspectionKey_key" ON "CanonicalReturnInspection"("inspectionKey");
CREATE UNIQUE INDEX "CanonicalReturnInspection_returnId_orderItemId_key" ON "CanonicalReturnInspection"("returnId", "orderItemId");
CREATE INDEX "CanonicalReturnInspection_orderId_occurredAt_idx" ON "CanonicalReturnInspection"("orderId", "occurredAt");
CREATE INDEX "CanonicalReturnInspection_product_disposition_idx" ON "CanonicalReturnInspection"("productId", "productVariantId", "disposition");
CREATE INDEX "CanonicalReturnInspection_createdByCommandId_idx" ON "CanonicalReturnInspection"("createdByCommandId");

CREATE TRIGGER "CanonicalDeliveryEvent_append_only_update"
BEFORE UPDATE ON "CanonicalDeliveryEvent"
BEGIN
  SELECT RAISE(ABORT, 'CanonicalDeliveryEvent is append-only');
END;

CREATE TRIGGER "CanonicalReturnEvent_append_only_update"
BEFORE UPDATE ON "CanonicalReturnEvent"
BEGIN
  SELECT RAISE(ABORT, 'CanonicalReturnEvent is append-only');
END;

CREATE TRIGGER "CanonicalReturnInspection_append_only_update"
BEFORE UPDATE ON "CanonicalReturnInspection"
BEGIN
  SELECT RAISE(ABORT, 'CanonicalReturnInspection is append-only');
END;
