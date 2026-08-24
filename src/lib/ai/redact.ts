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
const PHONE_KEYS = new Set(["phone", "phone2", "customerPhone", "contactPhone"]);

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

function maybeRedactPhone(value: unknown): string | null {
  return typeof value === "string" ? redactPhone(value) : null;
}

function maybeRedactCustomerName(value: unknown): string | null {
  return typeof value === "string" ? redactCustomerName(value) : null;
}

function hasText(value: unknown): boolean {
  return typeof value === "string" ? value.trim().length > 0 : Boolean(value);
}

function safeErrorOrNull(value: unknown): unknown {
  const record = asRecord(value);
  if (record && "error" in record) {
    return { error: redactToolResult(record.error) };
  }
  return null;
}

function mapAllowlistedRecords(
  value: unknown,
  serialize: (record: JsonRecord) => JsonRecord,
): unknown {
  if (!Array.isArray(value)) return safeErrorOrNull(value);
  return value.flatMap((entry) => {
    const record = asRecord(entry);
    return record ? [serialize(record)] : [];
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
      if (PHONE_KEYS.has(key)) {
        out[key] = typeof value === "string" ? redactPhone(value) : null;
      } else if (key === "address") {
        out[key] =
          typeof value === "string"
            ? value.length > 20
              ? value.slice(0, 10) + "••••"
              : "—"
            : null;
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
  if (!order || "error" in order) return safeErrorOrNull(value);

  const customer = asRecord(order.customer);
  const items = Array.isArray(order.items)
    ? order.items.flatMap((entry) => {
        const item = asRecord(entry);
        return item
          ? [
              {
                productName: item.productName,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                total: item.total,
              },
            ]
          : [];
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
  if (!customer || "error" in customer) return safeErrorOrNull(value);

  const orders = Array.isArray(customer.orders)
    ? customer.orders.flatMap((entry) => {
        const order = asRecord(entry);
        return order
          ? [
              {
                orderNumber: order.orderNumber,
                status: order.status,
                totalPrice: order.totalPrice,
                createdAt: order.createdAt,
              },
            ]
          : [];
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
        : null,
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
  if (!customer || "error" in customer) return safeErrorOrNull(value);
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
  if (!result || "error" in result) return safeErrorOrNull(value);
  return {
    customerId: result.customerId,
    hasNotes: hasText(result.notes),
  };
}

function serializeProposalSummary(
  toolName: string,
  summary: JsonRecord,
): JsonRecord {
  switch (toolName) {
    case "create_order":
      return {
        customerName: maybeRedactCustomerName(summary.customerName),
        itemCount: summary.itemCount,
        totalQuantity: summary.totalQuantity,
        wilaya: summary.wilaya,
      };
    case "create_customer":
      return {
        customerName: maybeRedactCustomerName(summary.customerName),
        phoneLast4:
          typeof summary.phoneLast4 === "string"
            ? `••${summary.phoneLast4.slice(-2)}`
            : null,
        wilaya: summary.wilaya,
      };
    case "update_customer_notes":
      return {
        customerName: maybeRedactCustomerName(summary.customerName),
        mode: summary.mode,
        noteLength: summary.noteLength,
      };
    default:
      return redactToolResult(summary) as JsonRecord;
  }
}

function serializePendingActionProposal(
  toolName: string,
  value: unknown,
): unknown {
  const root = asRecord(value);
  if (!root) return null;
  const proposal = asRecord(root.proposal);
  if (!proposal) {
    return {
      pending_action_proposal: true,
      tool: root.tool,
      proposalDigest: root.proposalDigest,
    };
  }

  const summary = asRecord(proposal.summary);
  return {
    pending_action_proposal: true,
    tool: root.tool,
    proposal: {
      id: proposal.id,
      toolName: proposal.toolName,
      status: proposal.status,
      proposalDigestPrefix: proposal.proposalDigestPrefix,
      summary:
        summary && CUSTOMER_PROPOSAL_TOOLS.has(toolName)
          ? serializeProposalSummary(toolName, summary)
          : summary
            ? (redactToolResult(summary) as JsonRecord)
            : null,
      expiresAt: proposal.expiresAt,
      createdAt: proposal.createdAt,
      executionState: proposal.executionState,
      lastErrorCode: proposal.lastErrorCode,
    },
    proposalDigest: root.proposalDigest,
  };
}

/**
 * Serialize one tool result for the remote model.
 *
 * Known customer/contact tools get explicit allowlisted projections. This
 * protects against future shape growth accidentally exposing a newly-added
 * PII field. Unexpected shapes fail closed except for the standard `error`
 * envelope. Unknown/non-PII tools retain the generic recursive sanitizer so
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
