-- Internal.16 Wave 4: upgrade an existing Storefront D1 database to the
-- immutable release-transfer and hosted-pause authority used by desktop V2.

ALTER TABLE storefront_release ADD COLUMN request_digest TEXT;

CREATE TABLE IF NOT EXISTS storefront_allocation_retirement (
  operation_id TEXT NOT NULL,
  storefront_id TEXT NOT NULL,
  source_release_id TEXT NOT NULL,
  item_key TEXT NOT NULL,
  retired_quantity INTEGER NOT NULL CHECK(retired_quantity > 0),
  reason TEXT NOT NULL CHECK(reason IN ('publish','rollback','pause')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(operation_id, item_key),
  FOREIGN KEY(storefront_id) REFERENCES storefront(storefront_id) ON DELETE CASCADE,
  FOREIGN KEY(source_release_id) REFERENCES storefront_release(release_id)
);

CREATE TABLE IF NOT EXISTS storefront_pause_operation (
  operation_id TEXT PRIMARY KEY NOT NULL,
  storefront_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  source_release_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(storefront_id) REFERENCES storefront(storefront_id) ON DELETE CASCADE,
  FOREIGN KEY(source_release_id) REFERENCES storefront_release(release_id)
);

-- Existing deployments have the original activation trigger, which advances the
-- active release but does not resume a previously paused storefront. Recreate it
-- with the Wave 4 state transition semantics.
DROP TRIGGER IF EXISTS storefront_release_activate;
CREATE TRIGGER storefront_release_activate
AFTER INSERT ON storefront_release
BEGIN
  UPDATE storefront
     SET active_release_id = NEW.release_id,
         state = 'active',
         updated_at = CURRENT_TIMESTAMP
   WHERE storefront_id = NEW.storefront_id;
END;
