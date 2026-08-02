CREATE TABLE IF NOT EXISTS trial_entitlement (
  device_binding TEXT PRIMARY KEY NOT NULL,
  license_id TEXT UNIQUE NOT NULL,
  issued_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS trial_entitlement_expiry_idx
  ON trial_entitlement(expires_at);
