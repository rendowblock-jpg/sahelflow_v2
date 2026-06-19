import { createClient } from "@supabase/supabase-js";

/**
 * M16 fix: getServiceSupabase was duplicated in 5 files. Consolidated into
 * this shared module. Returns a service-role client for server-side operations
 * that need to bypass RLS (cron jobs, webhooks, agents, etc.).
 *
 * Validates that env vars are present and throws a descriptive error if not.
 * Must NEVER be imported from client-side code.
 */
export function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "[ServiceSupabase] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}
