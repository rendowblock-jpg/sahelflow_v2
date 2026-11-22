-- 0006: order-level quantity-offer discount on storefront_receipt.
-- Whole dinars; 0 for every existing row and every non-bundle order.
-- ADD COLUMN only: never rebuild storefront_receipt.
-- APPLY THIS BEFORE deploying a Worker that writes discount_dzd.
-- Run ONCE:  wrangler d1 execute <db> --remote --file migrations/0006_receipt_discount.sql
ALTER TABLE storefront_receipt ADD COLUMN discount_dzd INTEGER NOT NULL DEFAULT 0 CHECK(discount_dzd >= 0);
