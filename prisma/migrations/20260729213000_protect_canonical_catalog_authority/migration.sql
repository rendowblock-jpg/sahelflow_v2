-- Defense-in-depth for canonical manual-order stock and catalog authority.
-- Service boundaries reject seller/AI stock edits while reservations are active.
-- These triggers additionally block dangerous raw stock increases behind active
-- reservations. Legitimate compatibility returns receive a transaction-scoped
-- permit that is inserted and removed in the same SQLite transaction.

CREATE TABLE IF NOT EXISTS "StockAdjustmentPermit" (
    "permitKey" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "productVariantId" TEXT,
    "direction" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockAdjustmentPermit_direction_check"
        CHECK ("direction" IN ('increase'))
);

CREATE INDEX IF NOT EXISTS "StockAdjustmentPermit_product_direction_idx"
    ON "StockAdjustmentPermit"("productId", "productVariantId", "direction");

CREATE TRIGGER IF NOT EXISTS "Product_block_stock_increase_with_active_reservation"
BEFORE UPDATE OF "stock" ON "Product"
FOR EACH ROW
WHEN NEW."stock" > OLD."stock"
  AND EXISTS (
    SELECT 1
    FROM "InventoryReservation"
    WHERE "productId" = OLD."id"
      AND "state" = 'active'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "StockAdjustmentPermit"
    WHERE "productId" = OLD."id"
      AND "productVariantId" IS NULL
      AND "direction" = 'increase'
  )
BEGIN
  SELECT RAISE(ABORT, 'product stock cannot increase behind an active canonical reservation');
END;

CREATE TRIGGER IF NOT EXISTS "ProductVariant_block_stock_increase_with_active_reservation"
BEFORE UPDATE OF "stock" ON "ProductVariant"
FOR EACH ROW
WHEN NEW."stock" > OLD."stock"
  AND EXISTS (
    SELECT 1
    FROM "InventoryReservation"
    WHERE "productVariantId" = OLD."id"
      AND "state" = 'active'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "StockAdjustmentPermit"
    WHERE "productId" = OLD."productId"
      AND "productVariantId" = OLD."id"
      AND "direction" = 'increase'
  )
BEGIN
  SELECT RAISE(ABORT, 'variant stock cannot increase behind an active canonical reservation');
END;

CREATE TRIGGER IF NOT EXISTS "Product_block_pending_trusted_deactivation"
BEFORE UPDATE OF "isActive", "deletedAt" ON "Product"
FOR EACH ROW
WHEN (NEW."isActive" = 0 OR NEW."deletedAt" IS NOT NULL)
  AND EXISTS (
    SELECT 1
    FROM "OrderItem" item
    JOIN "Order" purchase ON purchase."id" = item."orderId"
    WHERE item."productId" = OLD."id"
      AND purchase."status" = 'pending'
      AND purchase."deletedAt" IS NULL
      AND purchase."source" = 'manual'
      AND instr(COALESCE(purchase."sourceMetadata", ''), 'trusted-manual-v1') > 0
  )
BEGIN
  SELECT RAISE(ABORT, 'product is selected by a pending trusted manual order');
END;

CREATE TRIGGER IF NOT EXISTS "ProductVariant_block_pending_trusted_deactivation"
BEFORE UPDATE OF "isActive" ON "ProductVariant"
FOR EACH ROW
WHEN NEW."isActive" = 0
  AND OLD."isActive" <> 0
  AND EXISTS (
    SELECT 1
    FROM "OrderItem" item
    JOIN "Order" purchase ON purchase."id" = item."orderId"
    WHERE item."productVariantId" = OLD."id"
      AND purchase."status" = 'pending'
      AND purchase."deletedAt" IS NULL
      AND purchase."source" = 'manual'
      AND instr(COALESCE(purchase."sourceMetadata", ''), 'trusted-manual-v1') > 0
  )
BEGIN
  SELECT RAISE(ABORT, 'variant is selected by a pending trusted manual order');
END;
