/**
 * SahelFlow Delivery Service
 * Delivery/shipment CRUD operations.
 */

import { getSupabase } from "./supabase-helpers";
import { getActiveSellerId } from "./auth-service";

export async function getDeliveries(options?: { limit?: number; offset?: number }) {
  const limit = options?.limit ?? 50
  const offset = options?.offset ?? 0
  const { data, error, count } = await getSupabase()
    .from("deliveries")
    .select(
      "*, order:orders(id, order_number, status, wilaya, commune, address, total_price, customer:customers(name, phone))",
      { count: 'exact' }
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1)
  if (error) throw error;
  return { data: data || [], total: count ?? 0 };
}

export async function createDelivery(delivery: {
  order_id: string;
  provider: string;
  tracking_number?: string;
}) {
  const sellerId = await getActiveSellerId();
  const { data, error } = await getSupabase()
    .from("deliveries")
    .insert({ ...delivery, seller_id: sellerId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteDelivery(id: string) {
  const { error } = await getSupabase().from("deliveries").delete().eq("id", id);
  if (error) throw error;
}
