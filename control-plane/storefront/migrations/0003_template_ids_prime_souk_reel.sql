-- Prime, Souk and Reel: let an existing Storefront D1 database hold releases of the three new templates.
--
-- schema.sql already allows them, but a database created before this change still carries
--   CHECK(template_id IN ('sahara','atlas','oasis'))
-- on storefront_release, and SQLite cannot alter a CHECK constraint: the table has to be rebuilt.
--
-- DO NOT replace this with the usual "create new, copy, drop old, rename" recipe. It fails in two ways:
--  1. storefront_allocation and storefront_shipping_rule reference storefront_release with ON DELETE CASCADE, and
--     DROP TABLE performs an implicit DELETE that fires those cascades even with PRAGMA defer_foreign_keys = on.
--     Measured on a real D1 database (20 Oct 2026): parent rows kept, every child row silently gone.
--  2. Rows copied into a table with another name never repair the deferred violations of the tables that
--     reference storefront_release without a cascade (storefront_receipt, storefront_allocation_retirement,
--     storefront_pause_operation): SQLite lowers its violation counter only when a row is inserted into a table
--     that carries the parent's name. With any order on file the batch then fails at commit.
-- PRAGMA legacy_alter_table is refused by D1 (the batch is rolled back).
--
-- So: the release rows and the two cascading tables are held in side tables; the old table is dropped; the new one
-- is created under its FINAL name; the held rows go back into it, then into the two cascading tables. The two
-- triggers are created LAST: storefront_release_activate runs on every insert into storefront_release and would
-- otherwise re-activate a paused store and move active_release_id while the rows are being put back.
--
-- The side tables are deliberately NOT dropped first (no DROP TABLE IF EXISTS): if an interrupted run ever left them behind, they may
-- be the only copy of the data, and this file then stops at CREATE TABLE ("already exists") instead of erasing them.
-- Run it ONCE, as one batch:  wrangler d1 execute <database> --remote --file migrations/0003_template_ids_prime_souk_reel.sql
-- D1 rolls the whole batch back if a constraint is still violated at the end. Take a Time Travel bookmark first
-- (wrangler d1 time-travel info <database>) and compare row counts of every storefront_* table before and after.

PRAGMA defer_foreign_keys = on;

CREATE TABLE zz_mig0003_hold_release AS
  SELECT release_id, storefront_id, parent_release_id, template_id, locale, artifact_json, artifact_digest, request_digest, created_at
    FROM storefront_release;
CREATE TABLE zz_mig0003_hold_allocation AS
  SELECT release_id, item_key, unit_price_dzd, delegated_quantity, remaining_quantity FROM storefront_allocation;
CREATE TABLE zz_mig0003_hold_shipping_rule AS
  SELECT release_id, wilaya_code, delivery_mode, fee_dzd FROM storefront_shipping_rule;

DROP TABLE storefront_release;

CREATE TABLE storefront_release (
  release_id TEXT PRIMARY KEY NOT NULL,
  storefront_id TEXT NOT NULL,
  parent_release_id TEXT,
  template_id TEXT NOT NULL CHECK(template_id IN ('sahara','atlas','oasis','prime','souk','reel')),
  locale TEXT NOT NULL CHECK(locale IN ('ar','fr','en')),
  artifact_json TEXT NOT NULL,
  artifact_digest TEXT NOT NULL,
  request_digest TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(storefront_id) REFERENCES storefront(storefront_id) ON DELETE CASCADE,
  FOREIGN KEY(parent_release_id) REFERENCES storefront_release(release_id)
);

-- No trigger exists on the new table yet, so putting the rows back changes nothing else.
INSERT INTO storefront_release
  (release_id, storefront_id, parent_release_id, template_id, locale, artifact_json, artifact_digest, request_digest, created_at)
SELECT release_id, storefront_id, parent_release_id, template_id, locale, artifact_json, artifact_digest, request_digest, created_at
  FROM zz_mig0003_hold_release;

INSERT INTO storefront_allocation (release_id, item_key, unit_price_dzd, delegated_quantity, remaining_quantity)
  SELECT release_id, item_key, unit_price_dzd, delegated_quantity, remaining_quantity FROM zz_mig0003_hold_allocation;
INSERT INTO storefront_shipping_rule (release_id, wilaya_code, delivery_mode, fee_dzd)
  SELECT release_id, wilaya_code, delivery_mode, fee_dzd FROM zz_mig0003_hold_shipping_rule;

DROP TABLE zz_mig0003_hold_release;
DROP TABLE zz_mig0003_hold_allocation;
DROP TABLE zz_mig0003_hold_shipping_rule;

CREATE TRIGGER IF NOT EXISTS storefront_release_parent_guard
BEFORE INSERT ON storefront_release
BEGIN
  SELECT CASE
    WHEN (SELECT active_release_id FROM storefront WHERE storefront_id = NEW.storefront_id)
         IS NOT NEW.parent_release_id
    THEN RAISE(ABORT, 'stale_release_parent')
  END;
END;

CREATE TRIGGER IF NOT EXISTS storefront_release_activate
AFTER INSERT ON storefront_release
BEGIN
  UPDATE storefront
     SET active_release_id = NEW.release_id,
         state = 'active',
         updated_at = CURRENT_TIMESTAMP
   WHERE storefront_id = NEW.storefront_id;
END;
