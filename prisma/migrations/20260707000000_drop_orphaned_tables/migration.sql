-- Phase 5: Drop orphaned tables.
-- Notification: the bell at /api/notifications computes fresh; the persisted
--   table was never read back ("mark as read" is low-value for a COD seller).
-- DailyAnalyticsReport: declared in the schema but never written to in src/.
-- See documentation/DATA_INTEGRITY_PLAN.md §5.1 + §5.2.

DROP TABLE IF EXISTS "Notification";
DROP TABLE IF EXISTS "DailyAnalyticsReport";
