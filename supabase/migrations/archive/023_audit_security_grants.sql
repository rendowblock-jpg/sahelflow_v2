-- ============================================================================
-- SahelFlow v2 — Migration 023: Audit Security Grant Fixes
-- Date: 2026-06-02
-- Fixes: Over-broad EXECUTE grants found in 2026-06-02 security audit
-- ============================================================================

-- ─── CRITICAL: get_product_profitability had PUBLIC EXECUTE ───────────────────
-- Any unauthenticated user could call this SECURITY DEFINER function
-- and leak product margin data across all sellers.
REVOKE EXECUTE ON FUNCTION public.get_product_profitability() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_product_profitability() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_product_profitability() FROM anon;

-- Re-grant to service_role only (idempotent — safe to run multiple times)
GRANT EXECUTE ON FUNCTION public.get_product_profitability() TO service_role;

-- ─── CRITICAL: atomic_create_order had anon EXECUTE ──────────────────────────
-- Unauthenticated callers could inject orders via this SECURITY DEFINER RPC.
-- Keep 'authenticated' (needed by the place-order API route via auth client).
-- Exact signature from live DB (18 params):
REVOKE EXECUTE ON FUNCTION public.atomic_create_order(
  uuid, text, text, text, text, text, jsonb, numeric, numeric, numeric,
  text, text, text, text, text, text, text, text
) FROM anon;

-- ─── MODERATE: check_user_seller_access had anon EXECUTE ─────────────────────
-- Not critical (returns boolean only) but unnecessary exposure for anon role.
REVOKE EXECUTE ON FUNCTION public.check_user_seller_access(uuid) FROM anon;

-- ─── MODERATE: get_pnl_summary had authenticated EXECUTE ─────────────────────
-- Should be service_role only per masterplan Phase 1.1 (F-1).
-- It's called via /api/accounting/pnl which uses the service_role client.
REVOKE EXECUTE ON FUNCTION public.get_pnl_summary(text) FROM authenticated;

-- Ensure service_role grants are in place (idempotent)
GRANT EXECUTE ON FUNCTION public.get_pnl_summary(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.check_user_seller_access(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.atomic_create_order(
  uuid, text, text, text, text, text, jsonb, numeric, numeric, numeric,
  text, text, text, text, text, text, text, text
) TO service_role;

-- ─── VERIFY (informational, safe to run) ─────────────────────────────────────
-- After applying, run this query to confirm no over-broad grants remain:
--
-- SELECT grantee, routine_name, privilege_type
-- FROM information_schema.routine_privileges
-- WHERE routine_schema = 'public'
--   AND routine_name IN (
--     'get_product_profitability', 'atomic_create_order',
--     'check_user_seller_access', 'get_pnl_summary'
--   )
-- ORDER BY routine_name, grantee;
--
-- Expected result:
--   get_product_profitability  → postgres, service_role only
--   atomic_create_order        → authenticated, postgres, service_role only (no anon)
--   check_user_seller_access   → authenticated, postgres, service_role only (no anon)
--   get_pnl_summary            → postgres, service_role only (no authenticated)
