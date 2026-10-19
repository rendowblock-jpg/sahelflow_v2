-- Quota and rotation (ARCHITECTURE 10.3: 7 daily, 4 weekly, 6 monthly per shop,
-- 1 rolling point for a trial, "bounded by quota").
--
-- The quota check counted every stored point, including the one retention is about
-- to retire. A seller whose seven daily points filled the quota could therefore
-- never store the eighth: backups simply stopped. Now the points that retention
-- will retire the moment the new backup verifies are not counted against it:
--
--   * the new backup's shop and class decide which points those are;
--   * for daily / weekly / monthly that is every verified point of the same shop
--     and class with at least (keep - 1) newer verified points, the same order
--     retention.ts uses (control-plane/backup/retention.ts, KEEP_BY_CLASS);
--   * for a trial it is the single older verified point;
--   * pinned points never rotate and are always counted;
--   * a non-trial class gets the allowance only while no other upload of the
--     same shop and class is in flight, so two overlapping uploads cannot both
--     claim the same old point.
--
-- The keep numbers below are written as keep - 1 (daily 6, weekly 3, monthly 5,
-- trial 0). retention.test.ts fails if they drift from KEEP_BY_CLASS.
--
-- Apply once to an existing database:
--   wrangler d1 execute <db> --remote --file migrations/0004_quota_rotation.sql
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
      SELECT SUM(r.total_bytes)
        FROM cloud_backup r
       WHERE r.workspace_id = NEW.workspace_id
         AND r.state NOT IN ('failed','deleted')
         AND NOT (
           r.state = 'verified'
           AND r.shop_id = NEW.shop_id
           AND r.retention_class = NEW.retention_class
           AND NEW.retention_class IN ('daily','weekly','monthly','trial')
           AND (
             NEW.retention_class = 'trial'
             OR NOT EXISTS (
               SELECT 1
                 FROM cloud_backup f
                WHERE f.workspace_id = NEW.workspace_id
                  AND f.shop_id = NEW.shop_id
                  AND f.retention_class = NEW.retention_class
                  AND f.state IN ('initiated','uploading','awaiting_verification')
             )
           )
           AND (
             SELECT COUNT(*)
               FROM cloud_backup n
              WHERE n.workspace_id = r.workspace_id
                AND n.shop_id = r.shop_id
                AND n.retention_class = r.retention_class
                AND n.state = 'verified'
                AND (COALESCE(n.verified_at, n.created_at), n.created_at, n.backup_id)
                  > (COALESCE(r.verified_at, r.created_at), r.created_at, r.backup_id)
           ) >= CASE NEW.retention_class
                  WHEN 'daily' THEN 6
                  WHEN 'weekly' THEN 3
                  WHEN 'monthly' THEN 5
                  ELSE 0
                END
         )
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
