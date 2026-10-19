-- A trial seller keeps ONE rolling cloud backup point (ARCHITECTURE 7.2 / 10.3):
-- a newer backup replaces the older verified one. The previous guard refused every
-- trial backup after the first for as long as the first existed.
--
--   * a trial seller may not have two uploads in flight at once;
--   * the older VERIFIED trial point does not count against the quota of its
--     replacement, because retention deletes it as soon as the new one verifies
--     (control-plane/backup/retention.ts, KEEP_BY_CLASS.trial = 1).
--
-- Apply once to an existing database:
--   wrangler d1 execute <db> --remote --file migrations/0003_trial_rolling_backup.sql
DROP TRIGGER IF EXISTS cloud_backup_entitlement_guard;

CREATE TRIGGER cloud_backup_entitlement_guard
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
         AND NOT (NEW.retention_class = 'trial' AND retention_class = 'trial' AND state = 'verified')
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
         AND state IN ('initiated','uploading','awaiting_verification')
    ) THEN RAISE(ABORT, 'trial_backup_already_exists')
  END;
END;
