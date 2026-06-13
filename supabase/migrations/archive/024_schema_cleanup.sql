-- ============================================================================
-- SahelFlow v2 — Migration 024: Schema Cleanup
-- Date: 2026-06-02
-- Fixes: default_locale default, duplicate constraint, cost_price default,
--        legacy columns orders.return_reason and sellers.whatsapp_template
-- ============================================================================

-- ─── 2.1: Fix default_locale default ('fr' → 'ar') ───────────────────────────
-- Architecture and masterplan clearly state Arabic is the default locale.
-- New sellers were getting French UI on first login due to this mismatch.
ALTER TABLE public.sellers ALTER COLUMN default_locale SET DEFAULT 'ar';

-- ─── 2.2: Drop duplicate UNIQUE constraint on sellers.slug ───────────────────
-- Two identical constraints existed: sellers_slug_key (auto-named, older) and
-- sellers_slug_unique (explicitly named, from migration 014).
-- Dropping the auto-named one; keep sellers_slug_unique.
ALTER TABLE public.sellers DROP CONSTRAINT IF EXISTS sellers_slug_key;

-- ─── 2.3: Fix products.cost_price default (0 → NULL) ─────────────────────────
-- NULL means "cost unknown" — 0 means "product is free".
-- Having 0 as default corrupts P&L margin calculations for products with unknown cost.
ALTER TABLE public.products ALTER COLUMN cost_price DROP DEFAULT;
-- Existing rows with cost_price = 0 that were imported (not manually set) should
-- be corrected per seller. This migration only fixes future inserts.

-- ─── 2.4: Drop legacy orders.return_reason column ────────────────────────────
-- Returns are now tracked in the dedicated 'returns' table (from migration 008).
-- This column was flagged in MASTERPLAN 2.12 as referencing a non-existent flow.
-- The column is not written to by any live code path — only used as a callback
-- payload field in ConfirmationPanel (client-side only, not a DB write).
-- Code references in database.ts and ConfirmationPanel.tsx have been cleaned up.
ALTER TABLE public.orders DROP COLUMN IF EXISTS return_reason;

-- ─── 2.5: Drop legacy sellers.whatsapp_template column ───────────────────────
-- Superseded by the whatsapp_templates table (from migration 007/seeds).
-- All template functionality now uses the whatsapp_templates table.
-- Code references cleaned up in: template-service.ts, auth-service.ts,
-- automation/page.tsx, and database.ts (Seller interface).
ALTER TABLE public.sellers DROP COLUMN IF EXISTS whatsapp_template;

-- ─── VERIFY ──────────────────────────────────────────────────────────────────
-- After applying, run these to verify:
--
-- SELECT column_default FROM information_schema.columns
-- WHERE table_name = 'sellers' AND column_name = 'default_locale';
-- → Expected: 'ar'
--
-- SELECT COUNT(*) FROM pg_constraint
-- WHERE conrelid = 'sellers'::regclass AND conname LIKE '%slug%';
-- → Expected: 1 (only sellers_slug_unique)
--
-- SELECT column_default FROM information_schema.columns
-- WHERE table_name = 'products' AND column_name = 'cost_price';
-- → Expected: NULL (no default)
--
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'orders' AND column_name = 'return_reason';
-- → Expected: 0 rows
--
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'sellers' AND column_name = 'whatsapp_template';
-- → Expected: 0 rows
