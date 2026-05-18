/**
 * SahelFlow Storage Service
 * Image upload and data cleanup.
 */

import { getSupabase } from "./supabase-helpers";
import { getCurrentUser } from "./auth-service";

// ===== IMAGE UPLOAD =====

export async function uploadProductImage(file: File): Promise<string> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  const ext = file.name.split(".").pop();
  const path = `${user.id}/${Date.now()}.${ext}`;
  const { error } = await getSupabase().storage
    .from("product-images")
    .upload(path, file, { upsert: true });
  if (error) throw error;
  const { data } = getSupabase().storage
    .from("product-images")
    .getPublicUrl(path);
  return data.publicUrl;
}

// ===== DANGER ZONE =====

export async function clearTestData(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  
  // Because of foreign keys, delete in specific order
  // Deliveries -> Agent Activity -> Messages -> Conversations -> Orders -> Customers
  
  // 1. Deliveries (if tracked)
  await getSupabase().from('deliveries').delete().eq('seller_id', user.id);
  
  // 2. Agent Activity
  await getSupabase().from('agent_activity').delete().eq('seller_id', user.id);
  
  // 3. Messages & Conversations
  await getSupabase().from('messages').delete().eq('seller_id', user.id);
  await getSupabase().from('conversations').delete().eq('seller_id', user.id);
  
  // 4. Orders
  await getSupabase().from('orders').delete().eq('seller_id', user.id);
  
  // 5. Customers
  await getSupabase().from('customers').delete().eq('seller_id', user.id);
}
