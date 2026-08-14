CREATE TRIGGER IF NOT EXISTS cloud_backup_pinned_limit_guard
BEFORE INSERT ON cloud_backup
WHEN NEW.retention_class = 'pinned'
BEGIN
  SELECT CASE
    WHEN (
      SELECT COUNT(*)
        FROM cloud_backup
       WHERE workspace_id = NEW.workspace_id
         AND shop_id = NEW.shop_id
         AND retention_class = 'pinned'
         AND state NOT IN ('failed','deleted')
    ) >= 3 THEN RAISE(ABORT, 'pinned_backup_limit_reached')
  END;
END;
