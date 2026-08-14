-- Internal.16 Wave 4: hosted storefront stock delegation is canonical local
-- inventory authority. No local stock mutation may consume below an active
-- hosted delegation or an in-flight publish reservation.

CREATE TRIGGER IF NOT EXISTS product_storefront_delegation_stock_guard
BEFORE UPDATE OF stock ON Product
WHEN NEW.stock < OLD.stock
BEGIN
  SELECT CASE
    WHEN NEW.stock < COALESCE((
      SELECT SUM(quantity)
        FROM InventoryReservation
       WHERE productId = OLD.id
         AND state = 'active'
         AND (
           reservationKey LIKE 'storefront-delegation:%'
           OR reservationKey LIKE 'storefront-provisional:%'
         )
    ), 0)
    THEN RAISE(ABORT, 'storefront_delegation_stock_conflict')
  END;
END;

CREATE TRIGGER IF NOT EXISTS product_variant_storefront_delegation_stock_guard
BEFORE UPDATE OF stock ON ProductVariant
WHEN NEW.stock < OLD.stock
BEGIN
  SELECT CASE
    WHEN NEW.stock < COALESCE((
      SELECT SUM(quantity)
        FROM InventoryReservation
       WHERE productId = OLD.productId
         AND productVariantId = OLD.id
         AND state = 'active'
         AND (
           reservationKey LIKE 'storefront-delegation:%'
           OR reservationKey LIKE 'storefront-provisional:%'
         )
    ), 0)
    THEN RAISE(ABORT, 'storefront_delegation_stock_conflict')
  END;
END;
