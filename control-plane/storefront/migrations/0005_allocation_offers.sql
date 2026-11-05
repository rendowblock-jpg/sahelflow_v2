-- 0005: quantity offers. A nullable column on storefront_allocation holding the seller's fixed-price bundles as canonical JSON
-- ([{"q":2,"t":5500}]); NULL (every existing row) means no offers. ADD COLUMN only: never rebuild storefront_release or storefront_allocation
-- by drop-and-rename (see 0004: the cascade deletes the child rows). APPLY THIS BEFORE deploying a Worker that writes offers_json.
-- Run ONCE:  wrangler d1 execute <db> --remote --file migrations/0005_allocation_offers.sql
ALTER TABLE storefront_allocation ADD COLUMN offers_json TEXT;
