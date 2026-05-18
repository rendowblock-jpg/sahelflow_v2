/**
 * SahelFlow Supabase Client Helper (CLIENT-SIDE ONLY)
 *
 * Shared lazy-initialized Supabase browser client.
 * All client-side service files import getSupabase() from here.
 *
 * For API routes and server components, use @/lib/supabase/server instead.
 */

import { createClient } from "@/lib/supabase/client";

let _client: ReturnType<typeof createClient> | null = null;

export function getSupabase() {
  if (typeof window === "undefined") {
    throw new Error(
      "supabase-helpers.ts is client-only. Use @/lib/supabase/server for API routes/server components.",
    );
  }
  if (!_client) _client = createClient();
  return _client;
}
