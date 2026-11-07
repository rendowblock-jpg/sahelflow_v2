-- ITEM-2-MONEY, task 2: an order-level discount for hosted-storefront bundles, in whole dinars.
--
-- Why: a hosted checkout will sell "2 pieces for 5 500 instead of 6 000". The receipt keeps every line at the plain
-- unit price and carries the discount as one number, so the desktop must store it next to the order. The order total
-- stays one stored number (totalPrice = items - discountDzd + deliveryCost), so COD, revenue and customer totals,
-- which all read totalPrice, need no change; only the refund limit and the screens read the new column.
--
-- What this migration does NOT do, on purpose:
--  * It rewrites no row. ADD COLUMN with a constant default is a catalogue change in SQLite; every existing order reads 0.
--  * It drops, renames or updates nothing. Rolling back means leaving the column unused.
--  * It adds no index and no trigger (nothing searches by discount).

ALTER TABLE "Order" ADD COLUMN "discountDzd" INTEGER NOT NULL DEFAULT 0;
