CREATE TABLE IF NOT EXISTS trial_entitlement (
  device_binding TEXT PRIMARY KEY NOT NULL,
  license_id TEXT UNIQUE NOT NULL,
  issued_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS trial_entitlement_expiry_idx
  ON trial_entitlement(expires_at);

-- Dedicated bounded readiness state. Health never writes synthetic customer or
-- trial records; it only upserts this one fixed probe row to prove D1 write
-- capability for new-customer issuance.
CREATE TABLE IF NOT EXISTS licensing_readiness (
  probe_key TEXT PRIMARY KEY NOT NULL,
  observed_at TEXT NOT NULL
);
