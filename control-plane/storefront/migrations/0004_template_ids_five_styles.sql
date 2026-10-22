-- 0004: lets an existing storefront D1 database hold releases of noir, lumen, atelier, pulse and bloom. SQLite cannot alter a CHECK, so storefront_release is rebuilt
-- through side tables (the usual drop-and-rename deletes every allocation and shipping rule by cascade). Triggers are created LAST.
-- Run ONCE, as one batch, after a Time Travel bookmark:  wrangler d1 execute <db> --remote --file migrations/0004_template_ids_five_styles.sql
-- KEEP THIS FILE UNDER 4000 BYTES. D1 commits an import in chunks of about 4 KB; a chunk boundary between the DROP and the restore of
-- the child rows rolls the whole import back with a FOREIGN KEY error (measured 21 Oct 2026; migration-0004.test.ts has the details).

PRAGMA defer_foreign_keys = on;

CREATE TABLE zz_mig0004_hold_release AS
  SELECT release_id, storefront_id, parent_release_id, template_id, locale, artifact_json, artifact_digest, request_digest, created_at
    FROM storefront_release;
CREATE TABLE zz_mig0004_hold_allocation AS
  SELECT release_id, item_key, unit_price_dzd, delegated_quantity, remaining_quantity FROM storefront_allocation;
CREATE TABLE zz_mig0004_hold_shipping_rule AS
  SELECT release_id, wilaya_code, delivery_mode, fee_dzd FROM storefront_shipping_rule;

DROP TABLE storefront_release;

CREATE TABLE storefront_release (
  release_id TEXT PRIMARY KEY NOT NULL,
  storefront_id TEXT NOT NULL,
  parent_release_id TEXT,
  template_id TEXT NOT NULL CHECK(template_id IN ('sahara','atlas','oasis','prime','souk','reel','noir','lumen','atelier','pulse','bloom')),
  locale TEXT NOT NULL CHECK(locale IN ('ar','fr','en')),
  artifact_json TEXT NOT NULL,
  artifact_digest TEXT NOT NULL,
  request_digest TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(storefront_id) REFERENCES storefront(storefront_id) ON DELETE CASCADE,
  FOREIGN KEY(parent_release_id) REFERENCES storefront_release(release_id)
);

INSERT INTO storefront_release
  (release_id, storefront_id, parent_release_id, template_id, locale, artifact_json, artifact_digest, request_digest, created_at)
SELECT release_id, storefront_id, parent_release_id, template_id, locale, artifact_json, artifact_digest, request_digest, created_at
  FROM zz_mig0004_hold_release;

INSERT INTO storefront_allocation (release_id, item_key, unit_price_dzd, delegated_quantity, remaining_quantity)
  SELECT release_id, item_key, unit_price_dzd, delegated_quantity, remaining_quantity FROM zz_mig0004_hold_allocation;
INSERT INTO storefront_shipping_rule (release_id, wilaya_code, delivery_mode, fee_dzd)
  SELECT release_id, wilaya_code, delivery_mode, fee_dzd FROM zz_mig0004_hold_shipping_rule;

DROP TABLE zz_mig0004_hold_release;
DROP TABLE zz_mig0004_hold_allocation;
DROP TABLE zz_mig0004_hold_shipping_rule;

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
