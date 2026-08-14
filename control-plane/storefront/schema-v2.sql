-- Placeholder migration carrier for existing Storefront Worker D1 databases.
-- Fresh databases receive the same structures from schema.sql; deployment
-- automation may apply this idempotent additive migration before Wave 4 traffic.

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
