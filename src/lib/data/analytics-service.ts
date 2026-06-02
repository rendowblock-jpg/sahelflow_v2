/**
 * SahelFlow Analytics Service
 * Dashboard stats, COD cash flow, analytics data, and agent activity.
 *
 * Dashboard + analytics queries now route through /api/* endpoints
 * so they can use service_role client for SECURITY DEFINER RPCs.
 */

import { getSupabase } from "./supabase-helpers";
import { getActiveSellerId } from "./auth-service";

async function apiGet(path: string) {
  const res = await fetch(path, { credentials: "same-origin" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `API error ${res.status}`);
  }
  return res.json();
}

// ===== DASHBOARD STATS =====

export async function getDashboardStats() {
  return apiGet("/api/dashboard/stats");
}

// ===== COD CASH FLOW =====

export async function getCODStats() {
  const data = await apiGet("/api/dashboard/stats");
  return {
    moneyInTransit: data?.moneyInTransit ?? 0,
    packagesAtDepot: data?.packagesAtDepot ?? 0,
    returnsThisMonth: data?.returnsThisMonth ?? 0,
    collectedThisMonth: data?.collectedThisMonth ?? 0,
  };
}

// ===== ANALYTICS =====

export async function getAnalyticsData(
  range: "today" | "7d" | "30d" | "all" = "30d"
) {
  return apiGet(`/api/analytics?range=${encodeURIComponent(range)}`);
}

// ===== AGENT ACTIVITY =====

export async function getAgentActivity(limit = 20) {
  const { data, error } = await getSupabase()
    .from("agent_activity")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function logAgentActivity(
  type: string,
  title: string,
  description?: string,
  metadata?: Record<string, unknown>,
) {
  const sellerId = await getActiveSellerId();
  const { error } = await getSupabase().from("agent_activity").insert({
    seller_id: sellerId,
    type,
    title,
    description: description || null,
    metadata: metadata || {},
  });
  if (error) throw error;
}
