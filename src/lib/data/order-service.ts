/**
 * SahelFlow Order Service
 * Order CRUD, status transitions, automation triggers, and risk score updates.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { getSupabase } from "./supabase-helpers";
import { getCurrentUser } from "./auth-service";
import { executeRecipes } from "@/lib/automation/executor";
import type { Order, OrderStatus } from "@/types/database";

// ===== Webhook Helpers =====

/**
 * Check if an order with the same external_id already exists for this seller.
 * Used by webhook handlers for idempotency.
 */
export async function findExistingOrderByExternalId(
  supabase: SupabaseClient,
  sellerId: string,
  externalId: string,
): Promise<{ id: string } | null> {
  const { data } = await supabase
    .from("orders")
    .select("id")
    .eq("seller_id", sellerId)
    .eq("external_id", externalId)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  return data || null;
}

// ===== ORDERS =====

export async function getOrders(options?: {
  status?: string;
  limit?: number;
  offset?: number;
}) {
  const status = typeof options === "string" ? options : options?.status;
  const limit = typeof options === "object" ? (options?.limit ?? 50) : 50;
  const offset = typeof options === "object" ? (options?.offset ?? 0) : 0;

  let query = getSupabase()
    .from("orders")
    .select("*, customer:customers!left(id, name, phone, wilaya, commune)", {
      count: "exact",
    })
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (status && status !== "all") query = query.eq("status", status);
  const { data, error, count } = await query;
  if (error) throw error;
  return { data: (data || []).filter((o) => !o.deleted_at), total: count ?? 0 };
}

export async function getOrder(id: string) {
  const { data, error } = await getSupabase()
    .from("orders")
    .select("*, customer:customers(*)")
    .eq("id", id)
    .is("deleted_at", null)
    .single();
  if (error) throw error;
  return data;
}

export async function deleteOrder(id: string) {
  const { error } = await getSupabase()
    .from("orders")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null);
  if (error) throw error;
}

export async function restoreOrder(id: string) {
  const { data, error } = await getSupabase()
    .from("orders")
    .update({ deleted_at: null })
    .eq("id", id)
    .not("deleted_at", "is", null)
    .select("*, customer:customers(id, name, phone, wilaya, commune)")
    .single();
  if (error) throw error;
  return data;
}

export async function createOrder(order: {
  customer_id?: string;
  items: unknown[];
  total_price: number;
  delivery_cost?: number;
  net_profit?: number;
  wilaya?: string;
  commune?: string;
  address?: string;
  notes?: string;
}) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  const { data, error } = await getSupabase()
    .from("orders")
    .insert({ ...order, seller_id: user.id })
    .select("*, customer:customers(id, name, phone, wilaya, commune)")
    .single();
  if (error) throw error;
  return data;
}

export async function updateOrder(
  id: string,
  updates: Partial<
    Pick<
      Order,
      | "items"
      | "total_price"
      | "delivery_cost"
      | "net_profit"
      | "wilaya"
      | "commune"
      | "address"
      | "tracking_id"
      | "delivery_company"
      | "notes"
    >
  >,
) {
  const { data, error } = await getSupabase()
    .from("orders")
    .update(updates)
    .eq("id", id)
    .select("*, customer:customers(id, name, phone, wilaya, commune)")
    .single();
  if (error) throw error;
  return data;
}

export async function updateOrderStatus(id: string, status: OrderStatus) {
  const { error } = await getSupabase().rpc("atomic_update_order_status", {
    p_order_id: id,
    p_new_status: status,
  });

  if (error) throw error;

  // We need to fetch the customer data for the return object since the RPC returns the order only
  const { data: orderWithCustomer, error: fetchError } = await getSupabase()
    .from("orders")
    .select(
      "*, customer:customers(id, name, phone, wilaya, commune, order_count, total_spent)",
    )
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (fetchError) throw fetchError;

  // Auto-update customer risk score upon terminal returns (the RPC handles simple stats, but not risk score)
  const customerId = (orderWithCustomer.customer as Record<string, unknown>)
    ?.id as string | undefined;
  if (
    customerId &&
    (status === "returned" || status === "refused" || status === "cancelled")
  ) {
    try {
      const { data: custOrders } = await getSupabase()
        .from("orders")
        .select("status, total_price, created_at")
        .eq("customer_id", customerId)
        .is("deleted_at", null);
      if (custOrders) {
        const total = custOrders.length;
        const returned = custOrders.filter(
          (o) => o.status === "returned" || o.status === "refused",
        ).length;
        const cancelled = custOrders.filter(
          (o) => o.status === "cancelled",
        ).length;
        const delivered = custOrders.filter(
          (o) => o.status === "delivered",
        ).length;
        let score = 0;
        const returnRate = total > 0 ? returned / total : 0;
        if (returnRate >= 0.5) score += 35;
        else if (returnRate >= 0.25) score += 20;
        else if (returned > 0) score += 8;
        if (total > 0 && cancelled / total >= 0.4) score += 20;
        else if (cancelled > 0) score += 10;
        if (total >= 2 && delivered === 0) score += 20;
        if (delivered >= 3) score -= 10;
        if (total >= 5 && returnRate < 0.1) score -= 10;
        score = Math.max(0, Math.min(100, score));
        await getSupabase()
          .from("customers")
          .update({ risk_score: score })
          .eq("id", customerId);
      }
    } catch (e) {
      console.log(
        JSON.stringify({
          type: "customer_risk_score_update_error",
          error: (e as Error).message,
          customer_id: customerId,
        }),
      );
    }
  }

  // Run matching automations
  try {
    const statusTriggerMap: Record<string, string> = {
      draft: "order.created",
      pending: "order.created",
      confirmed: "order.confirmed",
      shipped: "order.shipped",
      delivered: "order.delivered",
      returned: "order.returned",
      refused: "order.returned",
      cancelled: "order.cancelled",
    };
    const triggerType = statusTriggerMap[status] || "order.created";

    const currentUser = await getCurrentUser();
    const sellerId = currentUser?.id;
    if (!sellerId) {
      console.log(
        JSON.stringify({
          type: "automation_skipped",
          reason: "No seller ID found",
          order_id: id,
        }),
      );
    } else {
      await executeRecipes({
        type: triggerType,
        sellerId,
        data: {
          order_id: id,
          customer_id: customerId || undefined,
          risk_score: 0,
          status,
          total_price: Number(orderWithCustomer.total_price || 0),
          wilaya: (orderWithCustomer.wilaya as string) || "",
        },
      });
    }
  } catch (e) {
    console.log(
      JSON.stringify({
        type: "automation_executor_error",
        error: (e as Error).message,
        order_id: id,
      }),
    );
  }

  return orderWithCustomer;
}
