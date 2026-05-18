/**
 * SahelFlow Automation Service
 * Automation recipe CRUD operations.
 */

import { getSupabase } from "./supabase-helpers";
import { getCurrentUser } from "./auth-service";
import type { Automation } from "@/types/database";

export async function getAutomations() {
  const { data, error } = await getSupabase()
    .from("automations")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createAutomation(automation: {
  name: string;
  description?: string;
  trigger_type: string;
  trigger_config?: unknown;
  action_type: string;
  action_config?: unknown;
  active?: boolean;
}) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  const { data, error } = await getSupabase()
    .from("automations")
    .insert({ ...automation, seller_id: user.id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateAutomation(
  id: string,
  updates: Partial<Pick<Automation, 'name' | 'description' | 'trigger_type' | 'trigger_config' | 'action_type' | 'action_config' | 'active' | 'run_count' | 'last_run_at'>>,
) {
  const { data, error } = await getSupabase()
    .from("automations")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteAutomation(id: string) {
  const { error } = await getSupabase().from("automations").delete().eq("id", id);
  if (error) throw error;
}
