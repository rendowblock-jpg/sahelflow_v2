-- Phase 1C: independent fulfillment, delivery, inventory and COD projections.
--
-- Existing rows remain NULL deliberately: legacy status is compatibility data,
-- not evidence that a canonical lifecycle command occurred. Trusted manual
-- orders are forward-repaired only by the governed fulfillment command after it
-- validates their active reservation facts.
ALTER TABLE "Order" ADD COLUMN "packedAt" DATETIME;
ALTER TABLE "Order" ADD COLUMN "fulfillmentState" TEXT;
ALTER TABLE "Order" ADD COLUMN "deliveryState" TEXT;
ALTER TABLE "Order" ADD COLUMN "inventoryState" TEXT;
ALTER TABLE "Order" ADD COLUMN "codState" TEXT;

CREATE INDEX "Order_fulfillmentState_idx" ON "Order"("fulfillmentState");
CREATE INDEX "Order_deliveryState_idx" ON "Order"("deliveryState");
CREATE INDEX "Order_codState_idx" ON "Order"("codState");

CREATE TRIGGER "Order_canonical_lifecycle_insert_check"
BEFORE INSERT ON "Order"
FOR EACH ROW
WHEN
  (NEW."fulfillmentState" IS NOT NULL AND NEW."fulfillmentState" NOT IN ('unfulfilled', 'preparing', 'ready', 'shipped', 'closed')) OR
  (NEW."deliveryState" IS NOT NULL AND NEW."deliveryState" NOT IN ('not_created', 'pending', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'failed', 'refused', 'return_in_transit', 'returned')) OR
  (NEW."inventoryState" IS NOT NULL AND NEW."inventoryState" NOT IN ('unreserved', 'reserved', 'outbound', 'return_pending_receipt', 'return_pending_inspection', 'settled')) OR
  (NEW."codState" IS NOT NULL AND NEW."codState" NOT IN ('not_expected', 'receivable', 'collected', 'partially_remitted', 'remitted', 'disputed', 'partially_refunded', 'refunded', 'corrected'))
BEGIN
  SELECT RAISE(ABORT, 'invalid canonical order lifecycle state');
END;

CREATE TRIGGER "Order_canonical_lifecycle_update_check"
BEFORE UPDATE OF "fulfillmentState", "deliveryState", "inventoryState", "codState" ON "Order"
FOR EACH ROW
WHEN
  (NEW."fulfillmentState" IS NOT NULL AND NEW."fulfillmentState" NOT IN ('unfulfilled', 'preparing', 'ready', 'shipped', 'closed')) OR
  (NEW."deliveryState" IS NOT NULL AND NEW."deliveryState" NOT IN ('not_created', 'pending', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'failed', 'refused', 'return_in_transit', 'returned')) OR
  (NEW."inventoryState" IS NOT NULL AND NEW."inventoryState" NOT IN ('unreserved', 'reserved', 'outbound', 'return_pending_receipt', 'return_pending_inspection', 'settled')) OR
  (NEW."codState" IS NOT NULL AND NEW."codState" NOT IN ('not_expected', 'receivable', 'collected', 'partially_remitted', 'remitted', 'disputed', 'partially_refunded', 'refunded', 'corrected'))
BEGIN
  SELECT RAISE(ABORT, 'invalid canonical order lifecycle state');
END;
