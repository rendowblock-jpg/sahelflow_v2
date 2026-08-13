-- Existing workspaces acquire the signed type on their first refresh.
ALTER TABLE connected_workspace ADD COLUMN license_type TEXT;

CREATE TABLE IF NOT EXISTS connected_command_policy (
  workspace_id TEXT NOT NULL,
  shop_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  policy_version INTEGER NOT NULL CHECK(policy_version >= 0),
  member_revocation_epoch INTEGER NOT NULL CHECK(member_revocation_epoch >= 0),
  device_revocation_epoch INTEGER NOT NULL CHECK(device_revocation_epoch >= 0),
  allowed_commands_json TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(workspace_id, shop_id, member_id, device_id),
  FOREIGN KEY(workspace_id, device_id)
    REFERENCES connected_device(workspace_id, device_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS connected_command_policy_expiry_idx
  ON connected_command_policy(workspace_id, expires_at);
