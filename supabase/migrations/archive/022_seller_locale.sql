-- ═══════════════════════════════════════════════
-- Phase 6: UX, i18n & Code Quality
-- Migration 022: Add locale preference to sellers
-- ═══════════════════════════════════════════════

-- Add default_locale column for per-seller language preference
ALTER TABLE sellers
  ADD COLUMN IF NOT EXISTS default_locale TEXT NOT NULL DEFAULT 'fr'
  CHECK (default_locale IN ('ar', 'fr', 'en'));

-- Add index for queries filtering by locale
CREATE INDEX IF NOT EXISTS idx_sellers_default_locale ON sellers (default_locale);
