/**
 * Who may read what through the in-app AI chat (AIX-01 / S06a-01).
 *
 * The chat route only requires `ai.use`, and the central tool policy leaves
 * `requiredPermissions` empty for reads. That let any member with `ai.use`
 * read profit, cost and order money the normal UI withholds from them (and send
 * it on to the remote model). This table gives every read tool the grants its
 * data needs, using the same gates the normal UI applies:
 *
 *   profit / revenue / analytics   analytics.read + analytics.financials.read
 *                                  (dashboard-projection `analyticsFinancials`)
 *   order totals, unit prices      orders.financials.read
 *   customer lifetime spend        orders.financials.read (customer-projection)
 *   product cost                   products.cost.read (product-projection)
 *   customer / order contact       customers.contact.read
 *
 * Two shapes, chosen per tool:
 *  - `requires`: ALL grants are needed to run the tool at all. Used for tools
 *    that are mostly gated data (stats, revenue report, per-product revenue,
 *    sales by wilaya) and for tools whose lookup key is a contact field (a name
 *    search is an oracle for the name even if the name is hidden afterwards).
 *  - `fieldGates`: the tool runs, but the listed result paths are removed
 *    unless the actor holds EVERY grant of the gate. Used for mixed tools
 *    (product details, order details, customer details, delivery lists, ...).
 *
 * The check runs in the registry wrapper before the tool body (see
 * `registerTool`). The MCP scope table (`MCP_READ_SCOPES`) stays the reference
 * for the minimum: a test pins that every chat requirement is a superset of it.
 */
import type { Phase2Action } from "@/lib/identity/permissions";

export interface ChatReadFieldGate {
  /** The paths below are kept only when the actor holds every grant listed. */
  readonly whenHeld: readonly Phase2Action[];
  /**
   * Dot paths below the result root. Arrays are walked transparently, so
   * `items.unitPrice` removes `unitPrice` from every element of `items`, and a
   * result that is itself an array applies the path to each element.
   */
  readonly paths: readonly string[];
}

export interface ChatReadAccessRule {
  /** Every grant is required before the tool body may run. */
  readonly requires: readonly Phase2Action[];
  readonly fieldGates?: readonly ChatReadFieldGate[];
}

const ORDER_MONEY: readonly Phase2Action[] = ["orders.financials.read"];
const ANALYTICS: readonly Phase2Action[] = [
  "analytics.read",
  "analytics.financials.read",
];

// Annotated directly (not inferred through Object.freeze) so every permission
// name is checked against the real `Phase2Action` vocabulary where it is written.
const CHAT_READ_ACCESS_TABLE: Record<string, ChatReadAccessRule> = {
  // Catalogue. Selling price and stock are what `products.read` shows in the UI.
  search_products: { requires: ["products.read"] },
  get_low_stock_products: { requires: ["products.read"] },
  // Mixed: unit COST is its own grant (products.cost.read).
  get_product_details: {
    requires: ["products.read"],
    fieldGates: [{ whenHeld: ["products.cost.read"], paths: ["cost"] }],
  },

  // Customers. Name/phone lookups need the contact grant.
  search_customers: {
    requires: ["customers.read", "customers.contact.read"],
    fieldGates: [{ whenHeld: ORDER_MONEY, paths: ["totalSpent"] }],
  },
  get_customer_details: {
    requires: ["customers.read", "customers.contact.read"],
    fieldGates: [
      { whenHeld: ["orders.read"], paths: ["orders"] },
      { whenHeld: ORDER_MONEY, paths: ["totalSpent", "orders.totalPrice"] },
      { whenHeld: ["risk.read", "orders.financials.read"], paths: ["riskScore"] },
    ],
  },
  get_customer_orders: {
    requires: ["customers.read", "orders.read"],
    fieldGates: [{ whenHeld: ORDER_MONEY, paths: ["totalPrice"] }],
  },

  // Orders.
  get_order_details: {
    requires: ["orders.read"],
    fieldGates: [
      {
        whenHeld: ORDER_MONEY,
        paths: ["totalPrice", "deliveryCost", "items.unitPrice", "items.total"],
      },
      {
        whenHeld: ["customers.contact.read"],
        paths: ["phone", "notes", "customer.name", "customer.phone"],
      },
    ],
  },
  list_recent_orders: {
    requires: ["orders.read"],
    fieldGates: [
      { whenHeld: ORDER_MONEY, paths: ["totalPrice"] },
      { whenHeld: ["customers.contact.read"], paths: ["customerName"] },
    ],
  },
  search_orders: {
    requires: ["orders.read", "customers.contact.read"],
    fieldGates: [{ whenHeld: ORDER_MONEY, paths: ["totalPrice"] }],
  },
  get_returns_summary: {
    requires: ["orders.read"],
    fieldGates: [{ whenHeld: ORDER_MONEY, paths: ["returnedValue"] }],
  },

  // Mostly financial: profit, revenue and per-product / per-wilaya sales.
  get_stats: { requires: ANALYTICS },
  get_revenue_report: { requires: ANALYTICS },
  get_top_products: { requires: ["products.read", ...ANALYTICS] },
  get_sales_by_wilaya: { requires: ANALYTICS },

  // Deliveries. Shipping cost follows the order-financials grant.
  get_delivery_status: {
    requires: ["deliveries.read"],
    fieldGates: [{ whenHeld: ORDER_MONEY, paths: ["shippingCost"] }],
  },
  get_pending_deliveries: {
    requires: ["deliveries.read"],
    fieldGates: [
      { whenHeld: ORDER_MONEY, paths: ["shippingCost"] },
      { whenHeld: ["customers.contact.read"], paths: ["customerName"] },
    ],
  },
  estimate_delivery_cost: { requires: ["deliveries.read"] },
  get_delivery_cost_comparison: { requires: ["deliveries.read"] },

  // Conversations. Search is keyed on the contact name.
  search_conversations: {
    requires: ["conversations.read", "customers.contact.read"],
  },
  get_conversation_messages: { requires: ["conversations.read"] },

  // Risk.
  get_wilaya_risk: { requires: ["risk.read"] },
};

export const CHAT_READ_ACCESS: Readonly<Record<string, ChatReadAccessRule>> =
  Object.freeze(CHAT_READ_ACCESS_TABLE);

export type ChatReadAccessDecision =
  | { allowed: true; withheldPaths: readonly string[] }
  | { allowed: false; missing: readonly Phase2Action[] };

/**
 * Decide what an actor may read from one tool. Fails closed: a tool with no
 * rule is refused (`missing` is empty because no known grant would unlock it).
 */
export function resolveChatReadAccess(
  toolName: string,
  can: (action: Phase2Action) => boolean,
  table: Readonly<Record<string, ChatReadAccessRule>> = CHAT_READ_ACCESS,
): ChatReadAccessDecision {
  if (!Object.prototype.hasOwnProperty.call(table, toolName)) {
    return { allowed: false, missing: [] };
  }
  const rule = table[toolName];
  if (!rule) return { allowed: false, missing: [] };

  const missing = rule.requires.filter((action) => !can(action));
  if (missing.length > 0) return { allowed: false, missing };

  return {
    allowed: true,
    withheldPaths: (rule.fieldGates ?? []).flatMap((gate) =>
      gate.whenHeld.every(can) ? [] : [...gate.paths],
    ),
  };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function omitPath(value: unknown, segments: readonly string[]): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => omitPath(entry, segments));
  }
  if (!isPlainRecord(value)) return value;
  const [head, ...rest] = segments;
  if (head === undefined || !Object.prototype.hasOwnProperty.call(value, head)) {
    return value;
  }
  if (rest.length === 0) {
    const copy = { ...value };
    delete copy[head];
    return copy;
  }
  return { ...value, [head]: omitPath(value[head], rest) };
}

/** Remove the given dot paths from a tool result without mutating the input. */
export function withholdPaths(
  value: unknown,
  paths: readonly string[],
): unknown {
  let result = value;
  for (const path of paths) {
    result = omitPath(result, path.split("."));
  }
  return result;
}
