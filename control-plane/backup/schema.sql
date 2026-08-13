CREATE TABLE IF NOT EXISTS backup_workspace (
  workspace_id TEXT PRIMARY KEY NOT NULL,
  license_id TEXT UNIQUE NOT NULL,
  installation_id TEXT NOT NULL,
  license_type TEXT NOT NULL CHECK(license_type IN ('trial','extension','permanent')),
  entitlement_expires_at TEXT,
  backup_bytes INTEGER NOT NULL CHECK(backup_bytes >= 0),
  features_json TEXT NOT NULL,
  entitlement_revocation_epoch INTEGER NOT NULL CHECK(entitlement_revocation_epoch >= 0),
  desktop_token_hash TEXT NOT NULL,
  desktop_signing_public_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS cloud_backup (
  workspace_id TEXT NOT NULL,
  backup_id TEXT NOT NULL,
  shop_id TEXT NOT NULL,
  retention_class TEXT NOT NULL CHECK(retention_class IN ('daily','weekly','monthly','pinned','trial')),
  wrapped_dek TEXT NOT NULL,
  manifest_sha256 TEXT NOT NULL,
  manifest_bytes INTEGER NOT NULL CHECK(manifest_bytes > 0),
  manifest_uploaded_at TEXT,
  chunk_count INTEGER NOT NULL CHECK(chunk_count > 0),
  total_bytes INTEGER NOT NULL CHECK(total_bytes > 0),
  state TEXT NOT NULL CHECK(state IN ('initiated','uploading','awaiting_verification','verified','failed','deleting','deleted')),
  verification_receipt_digest TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  verified_at TEXT,
  deleted_at TEXT,
  PRIMARY KEY(workspace_id, backup_id),
  FOREIGN KEY(workspace_id) REFERENCES backup_workspace(workspace_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS cloud_backup_retention_idx
  ON cloud_backup(workspace_id, shop_id, retention_class, state, created_at);

CREATE TABLE IF NOT EXISTS cloud_backup_chunk (
  workspace_id TEXT NOT NULL,
  backup_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL CHECK(chunk_index >= 0),
  object_key TEXT UNIQUE NOT NULL,
  sha256 TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK(byte_size > 0),
  uploaded_at TEXT,
  etag TEXT,
  PRIMARY KEY(workspace_id, backup_id, chunk_index),
  FOREIGN KEY(workspace_id, backup_id)
    REFERENCES cloud_backup(workspace_id, backup_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS cloud_backup_chunk_upload_idx
  ON cloud_backup_chunk(workspace_id, backup_id, uploaded_at);

CREATE TRIGGER IF NOT EXISTS cloud_backup_entitlement_guard
BEFORE INSERT ON cloud_backup
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1
        FROM backup_workspace
       WHERE workspace_id = NEW.workspace_id
         AND revoked_at IS NULL
         AND (entitlement_expires_at IS NULL OR datetime(entitlement_expires_at) > CURRENT_TIMESTAMP)
         AND (
           features_json LIKE '%"sahelflow.complete"%'
           OR features_json LIKE '%"sahelflow.backup"%'
         )
    ) THEN RAISE(ABORT, 'backup_entitlement_expired')
  END;
  SELECT CASE
    WHEN NEW.total_bytes + COALESCE((
      SELECT SUM(total_bytes)
        FROM cloud_backup
       WHERE workspace_id = NEW.workspace_id
         AND state NOT IN ('failed','deleted')
    ), 0) > (
      SELECT backup_bytes FROM backup_workspace WHERE workspace_id = NEW.workspace_id
    ) THEN RAISE(ABORT, 'backup_quota_exceeded')
  END;
  SELECT CASE
    WHEN (
      SELECT license_type FROM backup_workspace WHERE workspace_id = NEW.workspace_id
    ) <> 'permanent' AND EXISTS (
      SELECT 1
        FROM cloud_backup
       WHERE workspace_id = NEW.workspace_id
         AND state NOT IN ('failed','deleted')
    ) THEN RAISE(ABORT, 'trial_backup_already_exists')
  END;
END;
