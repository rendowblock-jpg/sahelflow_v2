/**
 * SahelFlow Risk Scoring Engine
 * Calculates customer risk scores based on real order history
 *
 * Score ranges: 0-100
 *   0-30  = Low risk (green)
 *   31-60 = Medium risk (yellow)
 *   61-100 = High risk (red)
 */

import { createClient } from "@/lib/supabase/client";

let _client: ReturnType<typeof createClient> | null = null;
function getSupabase() {
  if (!_client) _client = createClient();
  return _client;
}

export type RiskLevel = "low" | "medium" | "high";

export interface RiskResult {
  score: number;
  level: RiskLevel;
  factors: string[];
}

/**
 * Calculate risk score for a customer based on their order history
 */
export async function calculateCustomerRisk(
  customerId: string,
): Promise<RiskResult> {
  const { data: orders } = await getSupabase()
    .from("orders")
    .select("status, total_price, created_at")
    .eq("customer_id", customerId)
    .is("deleted_at", null);

  if (!orders || orders.length === 0) {
    return {
      score: 15,
      level: "low",
      factors: ["New customer — no order history"],
    };
  }

  let score = 0;
  const factors: string[] = [];

  const total = orders.length;
  const returned = orders.filter(
    (o) => o.status === "returned" || o.status === "refused",
  ).length;
  const cancelled = orders.filter((o) => o.status === "cancelled").length;
  const delivered = orders.filter((o) => o.status === "delivered").length;

  const returnRate = total > 0 ? returned / total : 0;
  if (returnRate > 0.3) {
    score += 35;
    factors.push(`High return rate: ${Math.round(returnRate * 100)}%`);
  } else if (returnRate >= 0.15) {
    score += 20;
    factors.push(`Elevated returns (>15% threshold): ${Math.round(returnRate * 100)}%`);
  } else if (returnRate > 0) {
    score += 8;
    factors.push(`Some returns: ${returned} of ${total} orders`);
  }

  // --- Factor 2: Cancellation rate (max +20 pts) ---
  const cancelRate = total > 0 ? cancelled / total : 0;
  if (cancelRate >= 0.4) {
    score += 20;
    factors.push(`High cancellation rate: ${Math.round(cancelRate * 100)}%`);
  } else if (cancelRate > 0) {
    score += 10;
    factors.push(`Some cancellations: ${cancelled} of ${total} orders`);
  }

  // --- Factor 3: No successful deliveries (max +20 pts) ---
  if (total >= 2 && delivered === 0) {
    score += 20;
    factors.push(`Zero successful deliveries from ${total} orders`);
  }

  // --- Factor 4: High average order value for new customer (+10 pts) ---
  const avgValue =
    orders.reduce((s, o) => s + Number(o.total_price || 0), 0) / total;
  if (total <= 2 && avgValue > 10000) {
    score += 10;
    factors.push(
      `High order value for new customer: ${Math.round(avgValue)} DA avg`,
    );
  }

  // --- Factor 5: All orders in last 24h = velocity spike (+15 pts) ---
  const recentOrders = orders.filter(
    (o) => Date.now() - new Date(o.created_at).getTime() < 86400000,
  );
  if (recentOrders.length >= 3) {
    score += 15;
    factors.push(`${recentOrders.length} orders in last 24 hours`);
  }

  // --- Positive signals reduce score ---
  if (delivered >= 3) {
    score -= 10;
    factors.push(`Trusted: ${delivered} successful deliveries`);
  }
  if (total >= 5 && returnRate < 0.1) {
    score -= 10;
    factors.push(`Loyal customer: ${total} orders, low return rate`);
  }

  // Clamp
  score = Math.max(0, Math.min(100, score));

  const level: RiskLevel =
    score <= 30 ? "low" : score <= 60 ? "medium" : "high";

  if (factors.length === 0) {
    factors.push("No risk factors detected");
  }

  return { score, level, factors };
}

/**
 * Calculate risk for all customers of the current seller
 */
export async function calculateAllCustomerRisks(): Promise<
  Array<{
    id: string;
    name: string;
    phone: string;
    wilaya: string;
    order_count: number;
    total_spent: number;
    is_blocked: boolean;
    risk: RiskResult;
  }>
> {
  const { data: customers } = await getSupabase()
    .from("customers")
    .select(
      "id, name, phone, wilaya, commune, order_count, total_spent, risk_score, is_blocked",
    )
    .order("created_at", { ascending: false });

  if (!customers || customers.length === 0) return [];

  // Fetch all orders for all customers in one query
  const customerIds = customers.map((c) => c.id);
  const { data: allOrders } = await getSupabase()
    .from("orders")
    .select("customer_id, status, total_price, created_at")
    .in("customer_id", customerIds)
    .is("deleted_at", null);

  const ordersByCustomer = new Map<string, typeof allOrders>();
  (allOrders || []).forEach((o) => {
    const existing = ordersByCustomer.get(o.customer_id) || [];
    existing.push(o);
    ordersByCustomer.set(o.customer_id, existing);
  });

  return customers.map((c) => {
    const orders = ordersByCustomer.get(c.id) || [];
    const risk = calculateRiskFromOrders(orders);
    return {
      id: c.id,
      name: c.name || "Unknown",
      phone: c.phone || "",
      wilaya: c.wilaya || "",
      order_count: orders.length || Number(c.order_count) || 0,
      total_spent: Number(c.total_spent) || 0,
      is_blocked: c.is_blocked || false,
      risk,
    };
  });
}

/**
 * Pure calculation from order array (no DB call)
 */
function calculateRiskFromOrders(
  orders: Array<{ status: string; total_price: number; created_at: string }>,
): RiskResult {
  if (!orders || orders.length === 0) {
    return { score: 15, level: "low", factors: ["New customer"] };
  }

  let score = 0;
  const factors: string[] = [];
  const total = orders.length;
  const returned = orders.filter(
    (o) => o.status === "returned" || o.status === "refused",
  ).length;
  const cancelled = orders.filter((o) => o.status === "cancelled").length;
  const delivered = orders.filter((o) => o.status === "delivered").length;

  const returnRate = returned / total;
  if (returnRate > 0.3) {
    score += 35;
    factors.push(`High return rate: ${Math.round(returnRate * 100)}%`);
  } else if (returnRate >= 0.15) {
    score += 20;
    factors.push(`Elevated returns (>15% threshold): ${Math.round(returnRate * 100)}%`);
  } else if (returned > 0) {
    score += 8;
    factors.push(`${returned} return(s)`);
  }

  const cancelRate = cancelled / total;
  if (cancelRate >= 0.4) {
    score += 20;
    factors.push(`High cancellation rate`);
  } else if (cancelled > 0) {
    score += 10;
    factors.push(`${cancelled} cancellation(s)`);
  }

  if (total >= 2 && delivered === 0) {
    score += 20;
    factors.push(`No deliveries from ${total} orders`);
  }

  const avgValue =
    orders.reduce((s, o) => s + Number(o.total_price || 0), 0) / total;
  if (total <= 2 && avgValue > 10000) {
    score += 10;
    factors.push(`High value: ${Math.round(avgValue)} DA avg`);
  }

  const recent = orders.filter(
    (o) => Date.now() - new Date(o.created_at).getTime() < 86400000,
  );
  if (recent.length >= 3) {
    score += 15;
    factors.push(`${recent.length} orders in 24h`);
  }

  if (delivered >= 3) {
    score -= 10;
    factors.push(`Trusted: ${delivered} deliveries`);
  }
  if (total >= 5 && returnRate < 0.1) {
    score -= 10;
    factors.push(`Loyal customer`);
  }

  score = Math.max(0, Math.min(100, score));
  const level: RiskLevel =
    score <= 30 ? "low" : score <= 60 ? "medium" : "high";
  if (factors.length === 0) factors.push("No risk factors");

  return { score, level, factors };
}

/**
 * Update a customer's risk_score in the database
 */
export async function updateCustomerRiskScore(
  customerId: string,
): Promise<void> {
  const risk = await calculateCustomerRisk(customerId);
  await getSupabase()
    .from("customers")
    .update({ risk_score: risk.score })
    .eq("id", customerId);
}
