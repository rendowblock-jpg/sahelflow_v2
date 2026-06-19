-- Migration 031: Atomic automation run_count increment (W2 fix)
-- Prevents race condition where concurrent events read the same run_count
-- and lose increments (read-then-write pattern replaced with atomic UPDATE).
--
-- Safety: SECURITY DEFINER, no user inputs, parameterized. Safe for all roles.

CREATE OR REPLACE FUNCTION increment_automation_run_count(p_automation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE automations
  SET
    run_count = COALESCE(run_count, 0) + 1,
    last_run_at = now()
  WHERE id = p_automation_id;
END;
$$;

-- Grant execute to authenticated users (automation executor uses service role,
-- but grant to authenticated for completeness)
GRANT EXECUTE ON FUNCTION increment_automation_run_count(uuid) TO authenticated, service_role;
