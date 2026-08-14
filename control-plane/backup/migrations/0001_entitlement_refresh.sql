-- Transitional columns are nullable only for workspaces created before Wave 4.
-- The first identity-bound signed refresh fills both values atomically.
ALTER TABLE backup_workspace ADD COLUMN device_binding TEXT;
ALTER TABLE backup_workspace ADD COLUMN product_major INTEGER;
