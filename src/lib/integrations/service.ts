import { createClient } from "@/lib/supabase/client";
import { getActiveSellerId } from "@/lib/data/service";
import type { Integration } from "@/types/database";

let _client: ReturnType<typeof createClient> | null = null;
function getSupabase() {
  if (!_client) _client = createClient();
  return _client;
}

// S14 fix: Safe columns for client-facing queries.
// Credentials (API tokens, secrets) must NEVER be sent to the browser.
// Server-side credential access is in server-service.ts (uses `server-only` to
// prevent accidental client-side imports).
//
// The integrations table has: id, seller_id, platform, credentials,
// is_active, last_sync, created_at. We select everything EXCEPT credentials.
const SAFE_INTEGRATION_COLUMNS =
  "id, seller_id, platform, is_active, last_sync, created_at";

/**
 * Safe integration data — same as Integration but without credentials.
 * This is what client-side code receives.
 */
export type SafeIntegration = Omit<Integration, "credentials">;

export async function getIntegrations(): Promise<SafeIntegration[]> {
  const { data, error } = await getSupabase()
    .from("integrations")
    .select(SAFE_INTEGRATION_COLUMNS)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as SafeIntegration[]) || [];
}

export async function saveIntegration(
  platform: string,
  credentials: Record<string, string>,
): Promise<Integration> {
  const sellerId = await getActiveSellerId();
  const { data, error } = await getSupabase()
    .from("integrations")
    .upsert(
      {
        seller_id: sellerId,
        platform,
        credentials,
        is_active: true,
      },
      { onConflict: "seller_id, platform" },
    )
    .select()
    .single();
  if (error) throw error;
  return data as Integration;
}
