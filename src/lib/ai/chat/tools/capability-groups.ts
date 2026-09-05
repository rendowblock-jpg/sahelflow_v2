import "server-only";

/**
 * Ledger F-06 — capability truth for the AI Agents page.
 *
 * The page must present what the agent can actually do, derived from the SAME
 * central authority the registry and the proposal runtime use — never a
 * hand-written marketing sentence that drifts. Grouping is fail-closed: a tool
 * registered in the policy map without a group (or grouped under an unknown
 * id) throws, so a future tool can never silently vanish from the page (or
 * appear under the wrong job) — the same discipline as the Task-5 registry.
 */

import {
  EXPECTED_AI_TOOL_NAMES,
  getAiToolPolicy,
} from "@/lib/ai/actions/contracts";
import { SahelFlowError } from "@/types/errors";

export type AiCapabilityGroupId =
  | "orders"
  | "customers"
  | "products"
  | "delivery"
  | "insights"
  | "conversations";

export interface AiCapabilityTool {
  name: string;
  executionClass: "read" | "external_read" | "sensitive";
}

export interface AiCapabilityGroup {
  id: AiCapabilityGroupId;
  tools: AiCapabilityTool[];
}

/**
 * Tools that are intentionally NOT page abilities: the policy map blocks them
 * (Gemini never receives their declarations), so presenting them as things the
 * agent can do would be a lie.
 */
const EXCLUDED_BLOCKED_TOOLS: readonly string[] = ["assign_order_to_delivery"];

const GROUP_BY_TOOL: Record<string, AiCapabilityGroupId> = {
  // Orders
  search_orders: "orders",
  get_order_details: "orders",
  list_recent_orders: "orders",
  create_order: "orders",
  update_order_status: "orders",
  cancel_order: "orders",
  // Customers
  search_customers: "customers",
  get_customer_details: "customers",
  get_customer_orders: "customers",
  create_customer: "customers",
  update_customer_notes: "customers",
  // Products
  search_products: "products",
  get_product_details: "products",
  get_low_stock_products: "products",
  get_top_products: "products",
  create_product: "products",
  update_product_price: "products",
  update_product_stock: "products",
  // Delivery
  estimate_delivery_cost: "delivery",
  get_delivery_cost_comparison: "delivery",
  get_delivery_status: "delivery",
  get_pending_deliveries: "delivery",
  // Insights
  get_stats: "insights",
  get_revenue_report: "insights",
  get_sales_by_wilaya: "insights",
  get_returns_summary: "insights",
  get_wilaya_risk: "insights",
  // Conversations
  search_conversations: "conversations",
  get_conversation_messages: "conversations",
};

const GROUP_ORDER: readonly AiCapabilityGroupId[] = [
  "orders",
  "customers",
  "products",
  "delivery",
  "insights",
  "conversations",
];

/**
 * Project the central policy map into page-facing capability groups.
 * Throws (fail-closed) when the policy map grows a tool that has no group and
 * is not explicitly excluded as blocked — the page can never drift from the
 * agent's real surface.
 */
export function aiCapabilityGroups(): AiCapabilityGroup[] {
  const buckets = new Map<AiCapabilityGroupId, AiCapabilityTool[]>(
    GROUP_ORDER.map((id) => [id, []]),
  );
  const seen = new Set<string>();

  for (const name of EXPECTED_AI_TOOL_NAMES) {
    if (EXCLUDED_BLOCKED_TOOLS.includes(name)) continue;
    const groupId = GROUP_BY_TOOL[name];
    if (!groupId || !buckets.has(groupId)) {
      throw new SahelFlowError(
        `AI capability '${name}' has no page group`,
        "AI_CAPABILITY_GROUP_MISSING",
        503,
      );
    }
    if (seen.has(name)) {
      throw new SahelFlowError(
        `AI capability '${name}' is grouped twice`,
        "AI_CAPABILITY_GROUP_DUPLICATE",
        503,
      );
    }
    seen.add(name);
    const policy = getAiToolPolicy(name);
    if (policy.executionClass === "blocked") continue;
    buckets.get(groupId)!.push({
      name,
      executionClass: policy.executionClass,
    });
  }

  // The reverse direction too: a group entry pointing at a name the policy
  // map does not know would render a phantom ability.
  for (const name of Object.keys(GROUP_BY_TOOL)) {
    if (!seen.has(name)) {
      throw new SahelFlowError(
        `AI capability group references unknown tool '${name}'`,
        "AI_CAPABILITY_GROUP_UNKNOWN_TOOL",
        503,
      );
    }
  }

  return GROUP_ORDER.map((id) => ({ id, tools: buckets.get(id)! })).filter(
    (group) => group.tools.length > 0,
  );
}
