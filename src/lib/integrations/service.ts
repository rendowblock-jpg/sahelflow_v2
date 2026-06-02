import { createClient } from "@/lib/supabase/client";
import { getActiveSellerId } from "@/lib/data/service";
import type { Integration } from "@/types/database";

let _client: ReturnType<typeof createClient> | null = null;
function getSupabase() {
  if (!_client) _client = createClient();
  return _client;
}

export async function getIntegrations(): Promise<Integration[]> {
  const { data, error } = await getSupabase()
    .from("integrations")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as Integration[]) || [];
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
