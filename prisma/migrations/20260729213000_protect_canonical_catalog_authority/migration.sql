-- Defense-in-depth for canonical manual-order stock and catalog authority.
-- Service boundaries reject seller/AI stock edits while reservations are active.
-- These triggers additionally block the dangerous raw-write case: increasing
-- available stock behind an active reservation, which could overcommit units.
-- Canonical reservation decrements and variant parent-projection decreases remain
-- allowed so products with multiple available units can confirm multiple orders.

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
