/**
 * PII redaction for AI tool results.
 *
 * Before feeding tool results back to the LLM (Gemini), redact sensitive PII
 * to minimize data exposure while preserving the operational fields the model
 * needs to answer the seller. Generic redaction remains conservative; known
 * customer/contact tool shapes use explicit allowlisted remote projections so
 * a generic `name` field is never treated as customer PII by accident.
 *
 * Strategy:
 *   - Phone numbers (0XXXXXXXXX, +213...) → "0X•••••XX" (last 2 digits visible)
 *   - Customer/contact names → first name + family-name initial
 *   - Street-level address + free-text notes → content withheld; region kept
 *   - Product/category/store names → unchanged
 *
 * This is a defense-in-depth layer, not a complete PII shield — the LLM still
 * sees the minimum business context needed for the request. For full privacy,
 * run the AI on-device (future).
 */
import "server-only";

const ALGERIAN_PHONE = /\b0[5-7]\d{8}\b/g;
const INTL_PHONE = /\+213\s?[5-7]\d{8}\b/g;

const CUSTOMER_PROPOSAL_TOOLS = new Set([
  "create_order",
  "create_customer",
  "update_customer_notes",
]);

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function maybeRedactPhone(value: unknown): unknown {
  return typeof value === "string" ? redactPhone(value) : value;
}

function maybeRedactCustomerName(value: unknown): unknown {
  return typeof value === "string" ? redactCustomerName(value) : value;
}

function hasText(value: unknown): boolean {
  return typeof value === "string" ? value.trim().length > 0 : Boolean(value);
}

function mapAllowlistedRecords(
  value: unknown,
  serialize: (record: JsonRecord) => JsonRecord,
): unknown {
  if (!Array.isArray(value)) return redactToolResult(value);
  return value.map((entry) => {
    const record = asRecord(entry);
    return record ? serialize(record) : redactToolResult(entry);
  });
}

/** Redact a phone number, keeping only the last 2 digits. */
export function redactPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "••••";
  return "0" + "•".repeat(digits.length - 3) + digits.slice(-2);
}

/** Redact all phone numbers in a string. */
export function redactPhonesInText(text: string): string {
  return text
    .replace(INTL_PHONE, (match) => redactPhone(match))
    .replace(ALGERIAN_PHONE, (match) => redactPhone(match));
}

/** Keep only a customer's first name and family-name initial. */
export function redactCustomerName(name: string): string {
  const parts = name.trim().split(/\s+/u).filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? "";
  const familyName = parts[parts.length - 1] ?? "";
  const initial = Array.from(familyName)[0] ?? "";
  return initial ? `${parts[0]} ${initial}.` : parts[0] ?? "";
}

/**
 * Generic PII redaction for an arbitrary JSON-serializable tool value.
 *
 * This deliberately does NOT redact a generic `name` key. Product, category,
 * store, provider, and variant names are legitimate model context. Customer
 * names are minimized only by the explicit tool-aware serializer below.
 */
export function redactToolResult(result: unknown): unknown {
  if (typeof result === "string") {
    return redactPhonesInText(result);
  }
  if (Array.isArray(result)) {
    return result.map(redactToolResult);
  }
  if (result !== null && typeof result === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(result as Record<string, unknown>)) {
      if (
        (key === "phone" ||
          key === "customerPhone" ||
          key === "contactPhone") &&
        typeof value === "string"
      ) {
        out[key] = redactPhone(value);
      } else if (key === "address" && typeof value === "string") {
        out[key] = value.length > 20 ? value.slice(0, 10) + "••••" : "—";
      } else {
        out[key] = redactToolResult(value);
      }
    }
    return out;
  }
  return result;
}

function serializeSearchCustomers(value: unknown): unknown {
  return mapAllowlistedRecords(value, (customer) => ({
    id: customer.id,
    name: maybeRedactCustomerName(customer.name),
    phone: maybeRedactPhone(customer.phone),
    wilaya: customer.wilaya,
    orderCount: customer.orderCount,
    totalSpent: customer.totalSpent,
  }));
}

function serializeOrderDetails(value: unknown): unknown {
  const order = asRecord(value);
  if (!order || "error" in order) return redactToolResult(value);

  const customer = asRecord(order.customer);
  const items = Array.isArray(order.items)
    ? order.items.map((entry) => {
        const item = asRecord(entry);
        return item
          ? {
              productName: item.productName,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              total: item.total,
            }
          : redactToolResult(entry);
      })
    : [];
  const delivery = asRecord(order.delivery);

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    totalPrice: order.totalPrice,
    deliveryCost: order.deliveryCost,
    wilaya: order.wilaya,
    commune: order.commune,
    phone: maybeRedactPhone(order.phone),
    hasNotes: hasText(order.notes),
    source: order.source,
    createdAt: order.createdAt,
    confirmedAt: order.confirmedAt,
    shippedAt: order.shippedAt,
    deliveredAt: order.deliveredAt,
    customer: customer
      ? {
          id: customer.id,
          name: maybeRedactCustomerName(customer.name),
          phone: maybeRedactPhone(customer.phone),
        }
      : null,
    items,
    delivery: delivery
      ? {
          status: delivery.status,
          provider: delivery.provider,
          trackingNumber: delivery.trackingNumber,
        }
      : null,
  };
}

function serializeRecentOrders(value: unknown): unknown {
  return mapAllowlistedRecords(value, (order) => ({
    orderNumber: order.orderNumber,
    customerName: maybeRedactCustomerName(order.customerName),
    status: order.status,
    totalPrice: order.totalPrice,
    wilaya: order.wilaya,
    createdAt: order.createdAt,
  }));
}

function serializeCustomerDetails(value: unknown): unknown {
  const customer = asRecord(value);
  if (!customer || "error" in customer) return redactToolResult(value);

  const orders = Array.isArray(customer.orders)
    ? customer.orders.map((entry) => {
        const order = asRecord(entry);
        return order
          ? {
              orderNumber: order.orderNumber,
              status: order.status,
              totalPrice: order.totalPrice,
              createdAt: order.createdAt,
            }
          : redactToolResult(entry);
      })
    : [];

  return {
    id: customer.id,
    name: maybeRedactCustomerName(customer.name),
    phone: maybeRedactPhone(customer.phone),
    phone2: maybeRedactPhone(customer.phone2),
    wilaya: customer.wilaya,
    commune: customer.commune,
    hasStreetAddress: hasText(customer.address),
    hasNotes: hasText(customer.notes),
    orderCount: customer.orderCount,
    totalSpent: customer.totalSpent,
    riskScore: customer.riskScore,
    createdAt: customer.createdAt,
    orders,
  };
}

function serializeConversations(value: unknown): unknown {
  return mapAllowlistedRecords(value, (conversation) => ({
    id: conversation.id,
    channel: conversation.channel,
    contactName: maybeRedactCustomerName(conversation.contactName),
    contactPhone: maybeRedactPhone(conversation.contactPhone),
    lastMessageAt: conversation.lastMessageAt,
    unreadCount: conversation.unreadCount,
  }));
}

function serializePendingDeliveries(value: unknown): unknown {
  return mapAllowlistedRecords(value, (delivery) => ({
    id: delivery.id,
    provider: delivery.provider,
    status: delivery.status,
    trackingNumber: delivery.trackingNumber,
    shippingCost: delivery.shippingCost,
    createdAt: delivery.createdAt,
    orderNumber: delivery.orderNumber,
    customerName: maybeRedactCustomerName(delivery.customerName),
    wilaya: delivery.wilaya,
  }));
}

function serializeConversationMessages(value: unknown): unknown {
  return mapAllowlistedRecords(value, (message) => ({
    id: message.id,
    direction: message.direction,
    body:
      typeof message.body === "string"
        ? redactPhonesInText(message.body)
        : message.body,
    timestamp: message.timestamp,
    extracted: message.extracted,
  }));
}

function serializeSearchOrders(value: unknown): unknown {
  return mapAllowlistedRecords(value, (order) => ({
    orderNumber: order.orderNumber,
    status: order.status,
    totalPrice: order.totalPrice,
    wilaya: order.wilaya,
    createdAt: order.createdAt,
    customerName: maybeRedactCustomerName(order.customerName),
    customerPhone: maybeRedactPhone(order.customerPhone),
  }));
}

function serializeLegacyCreateCustomer(value: unknown): unknown {
  const customer = asRecord(value);
  if (!customer || "error" in customer) return redactToolResult(value);
  return {
    id: customer.id,
    name: maybeRedactCustomerName(customer.name),
    phone: maybeRedactPhone(customer.phone),
    phone2: maybeRedactPhone(customer.phone2),
    wilaya: customer.wilaya,
    commune: customer.commune,
  };
}

function serializeLegacyCustomerNotes(value: unknown): unknown {
  const result = asRecord(value);
  if (!result || "error" in result) return redactToolResult(value);
  return {
    customerId: result.customerId,
    hasNotes: hasText(result.notes),
  };
}

function serializePendingActionProposal(
  toolName: string,
  value: unknown,
): unknown {
  const generic = redactToolResult(value);
  const root = asRecord(generic);
  if (!root) return generic;
  const proposal = asRecord(root.proposal);
  const summary = proposal ? asRecord(proposal.summary) : null;
  if (!proposal || !summary || !CUSTOMER_PROPOSAL_TOOLS.has(toolName)) {
    return generic;
  }

  const safeSummary: JsonRecord = { ...summary };
  if ("customerName" in safeSummary) {
    safeSummary.customerName = maybeRedactCustomerName(safeSummary.customerName);
  }
  if (toolName === "create_customer" && typeof safeSummary.phoneLast4 === "string") {
    safeSummary.phoneLast4 = `••${safeSummary.phoneLast4.slice(-2)}`;
  }

  return {
    ...root,
    proposal: {
      ...proposal,
      summary: safeSummary,
    },
  };
}

/**
 * Serialize one tool result for the remote model.
 *
 * Known customer/contact tools get explicit allowlisted projections. This
 * protects against future shape growth accidentally exposing a newly-added
 * PII field. Unknown/non-PII tools retain the generic recursive sanitizer so
 * product/category/store names remain useful and unchanged.
 */
export function serializeToolResultForRemoteModel(
  toolName: string,
  result: unknown,
): unknown {
  const record = asRecord(result);
  if (record?.pending_action_proposal === true) {
    return serializePendingActionProposal(toolName, result);
  }

  switch (toolName) {
    case "search_customers":
      return serializeSearchCustomers(result);
    case "get_order_details":
      return serializeOrderDetails(result);
    case "list_recent_orders":
      return serializeRecentOrders(result);
    case "get_customer_details":
      return serializeCustomerDetails(result);
    case "search_conversations":
      return serializeConversations(result);
    case "get_pending_deliveries":
      return serializePendingDeliveries(result);
    case "get_conversation_messages":
      return serializeConversationMessages(result);
    case "search_orders":
      return serializeSearchOrders(result);
    case "create_customer":
      return serializeLegacyCreateCustomer(result);
    case "update_customer_notes":
      return serializeLegacyCustomerNotes(result);
    default:
      return redactToolResult(result);
  }
}
