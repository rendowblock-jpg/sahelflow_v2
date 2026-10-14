-- Rejected receipts must return the units their lines consumed. The restore
-- fires only on received -> rejected, so a completion replay cannot add twice.
DROP TRIGGER IF EXISTS storefront_receipt_allocation_restore;
CREATE TRIGGER storefront_receipt_allocation_restore
AFTER UPDATE OF state ON storefront_receipt
WHEN NEW.state = 'rejected' AND OLD.state = 'received'
BEGIN
  UPDATE storefront_allocation
     SET remaining_quantity = remaining_quantity + (
       SELECT line.quantity
         FROM storefront_receipt_line line
        WHERE line.receipt_id = NEW.receipt_id
          AND line.release_id = storefront_allocation.release_id
          AND line.item_key = storefront_allocation.item_key
     )
   WHERE release_id = NEW.release_id
     AND item_key IN (
       SELECT line.item_key
         FROM storefront_receipt_line line
        WHERE line.receipt_id = NEW.receipt_id
          AND line.release_id = NEW.release_id
     );
END;
