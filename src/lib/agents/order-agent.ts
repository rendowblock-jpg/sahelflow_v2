/**
 * SahelFlow Order Agent
 * Evaluates new orders for risk, validates data, and auto-confirms safe ones.
 *
 * Trigger: New order created (status = "pending")
 * Actions:
 *   - Calculate risk score from customer history
 *   - Validate address/wilaya match
 *   - Auto-confirm low-risk orders OR flag high-risk for manual review
 */

import { callLLMJson } from "./groq";
import { getServiceSupabase } from "@/lib/supabase/service";
import { OrderAgentConfig, DEFAULT_ORDER_AGENT_CONFIG } from "./types";

// We use the service role client so agent operations bypass RLS

// ======= Types =======

interface RiskAssessment {
  risk_score: number; // 0-100
  risk_level: "low" | "medium" | "high";
  reasons: string[];
  recommendation: "auto_confirm" | "manual_review" | "auto_reject";
  address_valid: boolean;
}

interface OrderData {
  id: string;
  order_number: string;
  seller_id: string;
  customer_id: string | null;
  wilaya: string | null;
  commune: string | null;
  address: string | null;
  total_price: number;
  items: unknown[];
  source: string;
}

interface CustomerHistory {
  order_count: number;
  total_spent: number;
  risk_score: number;
  is_blocked: boolean;
  delivered_count: number;
  returned_count: number;
  refused_count: number;
}

/**
 * Fetch customer order history for risk calculation
 */
async function getCustomerHistory(
  customerId: string,
  sellerId: string,
): Promise<CustomerHistory> {
  const supabase = getServiceSupabase();

  const { data: customer } = await supabase
    .from("customers")
    .select("order_count, total_spent, risk_score, is_blocked")
    .eq("id", customerId)
    .eq("seller_id", sellerId)
    .single();

  // Get delivery history
  const { data: orders } = await supabase
    .from("orders")
    .select("status")
    .eq("customer_id", customerId)
    .eq("seller_id", sellerId);

  const allOrders = orders || [];

  return {
    order_count: customer?.order_count || 0,
    total_spent: customer?.total_spent || 0,
    risk_score: customer?.risk_score || 0,
    is_blocked: customer?.is_blocked || false,
    delivered_count: allOrders.filter((o) => o.status === "delivered").length,
    returned_count: allOrders.filter((o) => o.status === "returned").length,
    refused_count: allOrders.filter((o) => o.status === "refused").length,
  };
}

/**
 * Use AI to assess order risk based on all available signals
 * Includes seller's actual wilaya delivery statistics for dynamic risk context
 */
async function assessRiskWithAI(
  order: OrderData,
  history: CustomerHistory | null,
): Promise<RiskAssessment> {
  // Fetch seller's dynamic wilaya risk profiles
  let wilayaContext = "";
  try {
    const { computeDynamicWilayaProfiles } =
      await import("@/lib/ai/risk-engine");
    const profiles = await computeDynamicWilayaProfiles(order.seller_id);
    const orderWilaya = order.wilaya || "Unknown";
    const wp = profiles[orderWilaya];
    if (wp && wp.totalOrders > 0) {
      wilayaContext = `\nSELLER'S ACTUAL DELIVERY DATA FOR ${orderWilaya}:\n- Orders shipped: ${wp.totalOrders}\n- Return/refusal rate: ${Math.round(wp.returnRate * 100)}%\n- Risk multiplier: ${wp.riskMultiplier}x\n`;
    } else if (wp) {
      wilayaContext = `\nWILAYA ${orderWilaya} (no seller data yet — using national average):\n- Estimated return rate: ${Math.round(wp.returnRate * 100)}%\n`;
    }
  } catch {
    // Non-blocking: if risk engine fails, continue without wilaya context
  }

  const prompt = `You are a fraud/risk analyst for an Algerian e-commerce COD (Cash on Delivery) platform.

Evaluate this order and return a JSON risk assessment.

ORDER:
- Order #: ${order.order_number}
- Total: ${order.total_price} DZD
- Wilaya: ${order.wilaya || "NOT PROVIDED"}
- Commune: ${order.commune || "NOT PROVIDED"}
- Address: ${order.address || "NOT PROVIDED"}
- Source: ${order.source}
- Items: ${JSON.stringify(order.items)}

CUSTOMER HISTORY:
${
  history
    ? `- Previous orders: ${history.order_count}
- Total spent: ${history.total_spent} DZD
- Delivered: ${history.delivered_count}
- Returned: ${history.returned_count}
- Refused: ${history.refused_count}
- Already blocked: ${history.is_blocked}
- Current risk score: ${history.risk_score}`
    : "NEW CUSTOMER (no history)"
}
${wilayaContext}

RISK SIGNALS FOR ALGERIAN COD:
- High value orders from new customers are risky
- Missing or vague addresses (no commune/street) = high refusal risk
- History of returns/refusals = high risk
- Blocked customers = instant reject
- Repeat customers with good delivery history = low risk
- Consider the seller's actual delivery performance for this wilaya (if provided above)

Return ONLY valid JSON:
{
  "risk_score": <0-100>,
  "risk_level": "low" | "medium" | "high",
  "reasons": ["reason1", "reason2"],
  "recommendation": "auto_confirm" | "manual_review" | "auto_reject",
  "address_valid": true | false
}`;

  try {
    return await callLLMJson<RiskAssessment>(
      [{ role: "user", content: prompt }],
      { temperature: 0.1 },
    );
  } catch (err) {
    console.error(
      "[OrderAgent] AI risk assessment failed, using fallback:",
      err,
    );
    return fallbackRiskAssessment(order, history);
  }
}

/**
 * Deterministic fallback when AI is unavailable
 */
function fallbackRiskAssessment(
  order: OrderData,
  history: CustomerHistory | null,
): RiskAssessment {
  let score = 30; // baseline
  const reasons: string[] = [];

  // Blocked customer
  if (history?.is_blocked) {
    return {
      risk_score: 100,
      risk_level: "high",
      reasons: ["Customer is blocked"],
      recommendation: "auto_reject",
      address_valid: false,
    };
  }

  // New customer
  if (!history || history.order_count === 0) {
    score += 15;
    reasons.push("New customer, no history");
  }

  // Return/refusal history
  if (history && history.order_count > 0) {
    const badRate =
      (history.returned_count + history.refused_count) / history.order_count;
    if (badRate > 0.5) {
      score += 30;
      reasons.push(`High refusal rate: ${Math.round(badRate * 100)}%`);
    } else if (badRate > 0.2) {
      score += 15;
      reasons.push(`Moderate refusal rate: ${Math.round(badRate * 100)}%`);
    }
  }

  // Good history lowers the score
  if (history && history.delivered_count >= 3 && history.returned_count === 0) {
    score -= 20;
    reasons.push("Loyal customer with clean delivery history");
  }

  // Missing address
  if (!order.address || order.address.length < 10) {
    score += 15;
    reasons.push("Address is missing or too short");
  }

  // Missing wilaya
  if (!order.wilaya) {
    score += 10;
    reasons.push("Wilaya not specified");
  }

  // High value from new customer
  if (order.total_price > 15000 && (!history || history.order_count === 0)) {
    score += 15;
    reasons.push("High value order from new customer");
  }

  score = Math.max(0, Math.min(100, score));
  const risk_level = score < 30 ? "low" : score < 60 ? "medium" : "high";
  const recommendation =
    score < 30 ? "auto_confirm" : score > 85 ? "auto_reject" : "manual_review";

  return {
    risk_score: score,
    risk_level,
    reasons,
    recommendation,
    address_valid: Boolean(
      order.address && order.address.length >= 10 && order.wilaya,
    ),
  };
}

// ======= Main Entry Point =======

/**
 * Process a new pending order through the risk engine
 */
export async function processOrder(
  orderId: string,
  config?: Partial<OrderAgentConfig>,
): Promise<{
  action: "confirmed" | "flagged" | "rejected";
  assessment: RiskAssessment;
}> {
  const cfg = { ...DEFAULT_ORDER_AGENT_CONFIG, ...config };
  const supabase = getServiceSupabase();

  // 1. Fetch order
  const { data: order, error } = await supabase
    .from("orders")
    .select(
      "id, order_number, seller_id, customer_id, wilaya, commune, address, total_price, items, source, notes",
    )
    .eq("id", orderId)
    .single();

  if (error || !order) {
    throw new Error(`Order ${orderId} not found`);
  }

  // 2. Fetch customer history
  let history: CustomerHistory | null = null;
  if (order.customer_id) {
    history = await getCustomerHistory(order.customer_id, order.seller_id);
  }

  // 3. Assess risk
  const assessment = await assessRiskWithAI(order as OrderData, history);

  // 4. Take action based on config thresholds
  let action: "confirmed" | "flagged" | "rejected";

  if (assessment.risk_score <= cfg.auto_confirm_threshold) {
    if (assessment.recommendation !== "auto_confirm") {
      console.warn(`[OrderAgent] Recommendation mismatch: risk score is low (${assessment.risk_score}) but AI recommended '${assessment.recommendation}'`);
    }
    // Auto-confirm
    // W11 fix: Include AI recommendation in notes so sellers can see when
    // the AI disagreed with the threshold-based decision.
    const aiNote = assessment.recommendation !== "auto_confirm"
      ? ` [AI recommended: ${assessment.recommendation}]`
      : "";
    await supabase
      .from("orders")
      .update({
        notes: `[AI Agent] Auto-confirmed. Risk: ${assessment.risk_score}/100. ${assessment.reasons.join("; ")}${aiNote}` + (order.notes ? `\n${order.notes}` : ""),
      })
      .eq("id", orderId);

    const { error: rpcErrConfirm } = await supabase.rpc(
      "atomic_update_order_status",
      {
        p_order_id: orderId,
        p_new_status: "confirmed",
      },
    );
    if (rpcErrConfirm) {
      console.error(
        JSON.stringify({
          type: "order_agent",
          action: "rpc_error",
          error: rpcErrConfirm.message,
          order_id: orderId,
        }),
      );
      throw new Error(rpcErrConfirm.message);
    }

    action = "confirmed";
  } else if (assessment.risk_score >= cfg.auto_reject_threshold) {
    if (assessment.recommendation !== "auto_reject") {
      console.warn(`[OrderAgent] Recommendation mismatch: risk score is high (${assessment.risk_score}) but AI recommended '${assessment.recommendation}'`);
    }
    // Auto-reject / cancel
    // W11 fix: Include AI recommendation in notes.
    const aiNoteReject = assessment.recommendation !== "auto_reject"
      ? ` [AI recommended: ${assessment.recommendation}]`
      : "";
    await supabase
      .from("orders")
      .update({
        notes: `[AI Agent] Auto-rejected. Risk: ${assessment.risk_score}/100. ${assessment.reasons.join("; ")}${aiNoteReject}` + (order.notes ? `\n${order.notes}` : ""),
      })
      .eq("id", orderId);

    const { error: rpcErrReject } = await supabase.rpc(
      "atomic_update_order_status",
      {
        p_order_id: orderId,
        p_new_status: "cancelled",
      },
    );
    if (rpcErrReject) {
      console.error(
        JSON.stringify({
          type: "order_agent",
          action: "rpc_error",
          error: rpcErrReject.message,
          order_id: orderId,
        }),
      );
      throw new Error(rpcErrReject.message);
    }

    action = "rejected";
  } else {
    // Flag for manual review (don't change status, just add notes)
    await supabase
      .from("orders")
      .update({
        notes: `[AI Agent] Flagged for review. Risk: ${assessment.risk_score}/100. ${assessment.reasons.join("; ")}` + (order.notes ? `\n${order.notes}` : ""),
      })
      .eq("id", orderId);

    action = "flagged";
  }

  // 5. Update customer risk score (weighted: 70% history, 30% current assessment)
  if (order.customer_id) {
    const { data: existingCustomer } = await supabase
      .from("customers")
      .select("risk_score")
      .eq("id", order.customer_id)
      .single();

    const existingScore = existingCustomer?.risk_score;
    const finalScore =
      existingScore && existingScore > 0
        ? Math.round(existingScore * 0.7 + assessment.risk_score * 0.3)
        : assessment.risk_score;

    await supabase
      .from("customers")
      .update({ risk_score: finalScore })
      .eq("id", order.customer_id);
  }

  console.log(
    `[OrderAgent] Order ${order.order_number}: ${action} (risk=${assessment.risk_score})`,
  );

  return { action, assessment };
}
