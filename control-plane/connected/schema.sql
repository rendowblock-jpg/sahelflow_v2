CREATE TABLE IF NOT EXISTS connected_workspace (
  workspace_id TEXT PRIMARY KEY NOT NULL,
  license_id TEXT NOT NULL,
  installation_id TEXT NOT NULL,
  device_binding TEXT NOT NULL,
  product_major INTEGER NOT NULL,
  entitlement_revocation_epoch INTEGER NOT NULL,
  desktop_token_hash TEXT NOT NULL,
  desktop_signing_public_key TEXT NOT NULL,
  desktop_encryption_public_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS connected_workspace_license_idx
  ON connected_workspace(license_id);

CREATE TABLE IF NOT EXISTS connected_pairing (
  pairing_id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  token_hash TEXT UNIQUE NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(workspace_id) REFERENCES connected_workspace(workspace_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS connected_pairing_expiry_idx
  ON connected_pairing(workspace_id, expires_at);

CREATE TABLE IF NOT EXISTS connected_device (
  workspace_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  token_hash TEXT UNIQUE NOT NULL,
  signing_public_key TEXT NOT NULL,
  encryption_public_key TEXT NOT NULL,
  revocation_epoch INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT,
  revoked_at TEXT,
  PRIMARY KEY(workspace_id, device_id),
  FOREIGN KEY(workspace_id) REFERENCES connected_workspace(workspace_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS connected_device_member_idx
  ON connected_device(workspace_id, member_id, revoked_at);

CREATE TABLE IF NOT EXISTS connected_projection (
  workspace_id TEXT NOT NULL,
  shop_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  projection_type TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  envelope_id TEXT UNIQUE NOT NULL,
  envelope_json TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(workspace_id, shop_id, device_id, projection_type),
  FOREIGN KEY(workspace_id, device_id) REFERENCES connected_device(workspace_id, device_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS connected_command (
  relay_sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id TEXT NOT NULL,
  command_id TEXT UNIQUE NOT NULL,
  idempotency_key TEXT NOT NULL,
  envelope_digest TEXT NOT NULL,
  shop_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  envelope_json TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('queued','committed','rejected','conflict','revoked','expired')),
  expires_at TEXT NOT NULL,
  submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  result_digest TEXT,
  result_json TEXT,
  completed_at TEXT,
  FOREIGN KEY(workspace_id, device_id) REFERENCES connected_device(workspace_id, device_id) ON DELETE CASCADE,
  UNIQUE(workspace_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS connected_command_poll_idx
  ON connected_command(workspace_id, relay_sequence, state);

CREATE INDEX IF NOT EXISTS connected_command_device_idx
  ON connected_command(workspace_id, device_id, submitted_at);
