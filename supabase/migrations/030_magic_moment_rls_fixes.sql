-- ═══════════════════════════════════════════════════════════════
-- Migration 030: Magic Moment RLS security fixes (S1 + S10)
-- ═══════════════════════════════════════════════════════════════
-- S1: Restrict anon access to sellers table — previously anon could
--     SELECT * including webhook_token, email, phone, settings.
--     Now anon gets column-level GRANT on only safe public-form columns.
--     RLS policy sellers_public_select (form_enabled=true) still controls rows.
--
-- S10: Allow team members to SELECT their own team_members row.
--      Previously only the seller owner or admin team members could read
--      team_members rows, so getUserSellerContext returned null for regular
--      members (confirmer/packer/viewer) — breaking all team-member access.
-- ═══════════════════════════════════════════════════════════════

-- S1: Revoke full table SELECT from anon, grant only safe columns
REVOKE SELECT ON public.sellers FROM anon;
GRANT SELECT (
  id,
  business_name,
  slug,
  wilaya,
  form_config,
  default_locale,
  form_enabled,
  phone,
  shipping_rates
) ON public.sellers TO anon;
-- RLS policy "sellers_public_select" (form_enabled = true) stays — controls which rows anon sees.
-- Together: anon can only read safe columns of form-enabled sellers.

-- S10: Add self-select policy for team_members
-- Allows any authenticated user to read their own team_members row (by user_id).
-- The existing "team_members_manage" policy stays for admin/owner management.
DROP POLICY IF EXISTS "team_members_self_select" ON public.team_members;
CREATE POLICY "team_members_self_select" ON public.team_members
  FOR SELECT TO public
  USING (auth.uid() = user_id);
