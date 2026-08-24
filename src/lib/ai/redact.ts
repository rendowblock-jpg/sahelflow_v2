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
 *   - Phone numbers (0XXXXXXXXX, +213..., 00213...) → masked, last 2 digits visible
 *   - Customer/contact names → first name + family-name initial
 *   - Phone/email/address-like customer names → withheld rather than treated as names
 *   - Street-level address + free-text notes → content withheld; region kept
 *   - Free-form customer conversation bodies → fixed local context signals only
 *   - Product/category/store names → unchanged
 *   - Unclassified/future tools → fail closed until explicitly reviewed
 *
 * This is a defense-in-depth layer, not a complete PII shield — the LLM still
 * sees the minimum business context needed for the request. For full privacy,
 * run the AI on-device (future).
 */
import "server-only";

const FLEXIBLE_LOCAL_PHONE = /(?<!\d)0[5-7](?:[\p{Zs}\t.-]?\d){8}(?!\d)/gu;
const FLEXIBLE_INTL_PHONE = /(?<!\d)(?:\+213|00213)[\p{Zs}\t.-]?[5-7](?:[\p{Zs}\t.-]?\d){8}(?!\d)/gu;
const ORDER_REFERENCE_HINT = /\b(?:ORD|CMD|SYNC-(?:SHOPIFY|WOOCOMMERCE|YOUCAN))-[A-Z0-9-]{1,32}\b/iu;
const PHONE_KEYS = new Set(["phone", "phone2", "customerPhone", "contactPhone"]);

const CONVERSATION_CONTEXT_RULES = [
  ["greeting", /(?:bonjour|salut|hello|salam|سلام|السلام عليكم)/iu],
  ["thanks", /(?:merci|thanks|thank you|شكرا|شكرًا)/iu],
  ["order", /(?:\bcommande\b|\border\b|طلب|طلبي|الطلب)/iu],
  ["delivery", /(?:\blivraison\b|\bdelivery\b|\bshipment\b|\bshipping\b|\bcolis\b|توصيل|التوصيل|شحن)/iu],
  ["product", /(?:\bproduit\b|\bproduct\b|\barticle\b|منتج|سلعة)/iu],
  ["price", /(?:\bprix\b|\bprice\b|\bcombien\b|سعر|ثمن)/iu],
  ["availability", /(?:\bstock\b|\bdisponible\b|\bavailable\b|متوفر|توفر)/iu],
  ["return_refund", /(?:\bretour\b|\bremboursement\b|\brefund\b|\breturn\b|إرجاع|ارجاع|استرجاع)/iu],
  ["cancel", /(?:\bannul(?:er|ation|é|ée)?\b|\bcancel(?:led|ation)?\b|إلغاء|الغاء)/iu],
  ["address", /(?:\badresse\b|\baddress\b|عنوان)/iu],
  ["contact", /(?:\bt[ée]l[ée]phone\b|\bphone\b|\bappel\b|\bcall\b|هاتف|اتصل|رقم)/iu],
  ["problem", /(?:\bprobl[eè]me\b|\bproblem\b|\bissue\b|مشكل|شكوى)/iu],
  ["confirmation", /(?:\boui\b|\byes\b|\bd['’]accord\b|\bok\b|نعم|موافق)/iu],
  ["negative", /(?:\bnon\b|\bno\b|لا)/iu],
] as const satisfies ReadonlyArray<readonly [string, RegExp]>;

const TOOL_AWARE_REMOTE_TOOL_NAMES = [
  "search_customers",
  "get_order_details",
  "list_recent_orders",
  "get_customer_details",
  "search_conversations",
  "get_pending_deliveries",
  "get_conversation_messages",
  "search_orders",
  "create_customer",
  "update_customer_notes",
] as const;

const REVIEWED_GENERIC_REMOTE_TOOL_NAMES = [
  "search_products",
  "get_stats",
  "get_low_stock_products",
  "get_revenue_report",
  "get_delivery_status",
  "get_top_products",
  "get_wilaya_risk",
  "get_product_details",
  "get_customer_orders",
  "get_returns_summary",
  "get_sales_by_wilaya",
  "estimate_delivery_cost",
  "get_delivery_cost_comparison",
  "create_order",
  "update_order_status",
  "update_product_stock",
  "cancel_order",
  "create_product",
  "update_product_price",
  "assign_order_to_delivery",
] as const;

const TOOL_AWARE_REMOTE_TOOL_SET = new Set<string>(TOOL_AWARE_REMOTE_TOOL_NAMES);
const REVIEWED_GENERIC_REMOTE_TOOL_SET = new Set<string>(
  REVIEWED_GENERIC_REMOTE_TOOL_NAMES,
);

export const AI_REMOTE_SERIALIZATION_TOOL_NAMES = Object.freeze(
  [
    ...TOOL_AWARE_REMOTE_TOOL_NAMES,
    ...REVIEWED_GENERIC_REMOTE_TOOL_NAMES,
  ].sort(),
);

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

function isKnownRemoteTool(toolName: string): boolean {
  return (
    TOOL_AWARE_REMOTE_TOOL_SET.has(toolName) ||
    REVIEWED_GENERIC_REMOTE_TOOL_SET.has(toolName)
  );
}

function safeString(value: unknown, maxLength = 256): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) return null;
  return redactPhonesInText(trimmed);
}

function safeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function safeBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function safeTimestamp(value: unknown): string | null {
  let date: Date;
  if (value instanceof Date) {
    date = value;
  } else if (typeof value === "string" && value.length <= 128) {
    date = new Date(value);
  } else {
    return null;
  }
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function safeDigestPrefix(value: unknown): string | null {
  return typeof value === "string" && /^[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

function maybeRedactPhone(value: unknown): string | null {
  return typeof value === "string" ? redactPhone(value) : null;
}

function maybeRedactCustomerName(value: unknown): string | null {
  return typeof value === "string" ? redactCustomerName(value) : null;
}

function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function safeErrorOrNull(value: unknown): unknown {
  const record = asRecord(value);
  if (record && "error" in record) {
    return { error: "Tool failed" };
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

function conversationContextProjection(value: unknown): JsonRecord | null {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFKC").trim();
  if (!normalized) return null;

  const intents = CONVERSATION_CONTEXT_RULES.flatMap(([tag, pattern]) =>
    pattern.test(normalized) ? [tag] : [],
  );
  return {
    question: /[?؟]/u.test(normalized),
    intents: intents.length > 0 ? intents : ["other"],
    hasOrderReference: ORDER_REFERENCE_HINT.test(normalized),
  };
}

/** Redact a phone number, keeping only the last 2 digits. */
export function redactPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "••••";
  return "0" + "•".repeat(digits.length - 3) + digits.slice(-2);
}

/** Redact Algerian local/international phone numbers in free text. */
export function redactPhonesInText(text: string): string {
  return text
    .replace(FLEXIBLE_INTL_PHONE, (match) => redactPhone(match))
    .replace(FLEXIBLE_LOCAL_PHONE, (match) => redactPhone(match));
}

/** Keep only a customer's first name and family-name initial. */
export function redactCustomerName(name: string): string {
  const normalized = name.normalize("NFKC").trim();
  if (!normalized || normalized.length > 200) return "••••";

  const withoutPhoneLikeContent = normalized
    .replace(FLEXIBLE_INTL_PHONE, " ")
    .replace(FLEXIBLE_LOCAL_PHONE, " ")
    .replace(/\s+/gu, " ")
    .trim();
  if (!withoutPhoneLikeContent) return "••••";

  // A customer-name field is untrusted imported/provider text. After removing
  // recognized phones, only a human-name-shaped value may be emitted. This
  // rejects email/address/identifier-shaped values containing digits, @, /, etc.
  if (
    !/^[\p{L}\p{M}]+(?:[ '\u2019.-][\p{L}\p{M}]+)*$/u.test(
      withoutPhoneLikeContent,
    )
  ) {
    return "••••";
  }

  const parts = withoutPhoneLikeContent.split(/\s+/u).filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? "••••";
  const familyName = parts[parts.length - 1] ?? "";
  const initial = Array.from(familyName)[0] ?? "";
  return initial ? `${parts[0]} ${initial}.` : parts[0] ?? "••••";
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
    if (result instanceof Date) {
      return Number.isNaN(result.getTime()) ? null : result.toISOString();
    }
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
    id: safeString(customer.id),
    name: maybeRedactCustomerName(customer.name),
    phone: maybeRedactPhone(customer.phone),
    wilaya: safeString(customer.wilaya),
    orderCount: safeNumber(customer.orderCount),
    totalSpent: safeNumber(customer.totalSpent),
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
                productName: safeString(item.productName),
                quantity: safeNumber(item.quantity),
                unitPrice: safeNumber(item.unitPrice),
                total: safeNumber(item.total),
              },
            ]
          : [];
      })
    : [];
  const delivery = asRecord(order.delivery);

  return {
    id: safeString(order.id),
    orderNumber: safeString(order.orderNumber),
    status: safeString(order.status),
    totalPrice: safeNumber(order.totalPrice),
    deliveryCost: safeNumber(order.deliveryCost),
    wilaya: safeString(order.wilaya),
    commune: safeString(order.commune),
    phone: maybeRedactPhone(order.phone),
    hasNotes: hasText(order.notes),
    source: safeString(order.source),
    createdAt: safeTimestamp(order.createdAt),
    confirmedAt: safeTimestamp(order.confirmedAt),
    shippedAt: safeTimestamp(order.shippedAt),
    deliveredAt: safeTimestamp(order.deliveredAt),
    customer: customer
      ? {
          id: safeString(customer.id),
          name: maybeRedactCustomerName(customer.name),
          phone: maybeRedactPhone(customer.phone),
        }
      : null,
    items,
    delivery: delivery
      ? {
          status: safeString(delivery.status),
          provider: safeString(delivery.provider),
          trackingNumber: safeString(delivery.trackingNumber),
        }
      : null,
  };
}

function serializeRecentOrders(value: unknown): unknown {
  return mapAllowlistedRecords(value, (order) => ({
    orderNumber: safeString(order.orderNumber),
    customerName: maybeRedactCustomerName(order.customerName),
    status: safeString(order.status),
    totalPrice: safeNumber(order.totalPrice),
    wilaya: safeString(order.wilaya),
    createdAt: safeTimestamp(order.createdAt),
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
                orderNumber: safeString(order.orderNumber),
                status: safeString(order.status),
                totalPrice: safeNumber(order.totalPrice),
                createdAt: safeTimestamp(order.createdAt),
              },
            ]
          : [];
      })
    : [];

  return {
    id: safeString(customer.id),
    name: maybeRedactCustomerName(customer.name),
    phone: maybeRedactPhone(customer.phone),
    phone2: maybeRedactPhone(customer.phone2),
    wilaya: safeString(customer.wilaya),
    commune: safeString(customer.commune),
    hasStreetAddress: hasText(customer.address),
    hasNotes: hasText(customer.notes),
    orderCount: safeNumber(customer.orderCount),
    totalSpent: safeNumber(customer.totalSpent),
    riskScore: safeNumber(customer.riskScore),
    createdAt: safeTimestamp(customer.createdAt),
    orders,
  };
}

function serializeConversations(value: unknown): unknown {
  return mapAllowlistedRecords(value, (conversation) => ({
    id: safeString(conversation.id),
    channel: safeString(conversation.channel),
    contactName: maybeRedactCustomerName(conversation.contactName),
    contactPhone: maybeRedactPhone(conversation.contactPhone),
    lastMessageAt: safeTimestamp(conversation.lastMessageAt),
    unreadCount: safeNumber(conversation.unreadCount),
  }));
}

function serializePendingDeliveries(value: unknown): unknown {
  return mapAllowlistedRecords(value, (delivery) => ({
    id: safeString(delivery.id),
    provider: safeString(delivery.provider),
    status: safeString(delivery.status),
    trackingNumber: safeString(delivery.trackingNumber),
    shippingCost: safeNumber(delivery.shippingCost),
    createdAt: safeTimestamp(delivery.createdAt),
    orderNumber: safeString(delivery.orderNumber),
    customerName: maybeRedactCustomerName(delivery.customerName),
    wilaya: safeString(delivery.wilaya),
  }));
}

function serializeConversationMessages(value: unknown): unknown {
  return mapAllowlistedRecords(value, (message) => ({
    id: safeString(message.id),
    direction: safeString(message.direction),
    body: null,
    bodyWithheld: hasText(message.body),
    context: conversationContextProjection(message.body),
    timestamp: safeTimestamp(message.timestamp),
    extracted: safeBoolean(message.extracted),
  }));
}

function serializeSearchOrders(value: unknown): unknown {
  return mapAllowlistedRecords(value, (order) => ({
    orderNumber: safeString(order.orderNumber),
    status: safeString(order.status),
    totalPrice: safeNumber(order.totalPrice),
    wilaya: safeString(order.wilaya),
    createdAt: safeTimestamp(order.createdAt),
    customerName: maybeRedactCustomerName(order.customerName),
    customerPhone: maybeRedactPhone(order.customerPhone),
  }));
}

function serializeLegacyCreateCustomer(value: unknown): unknown {
  const customer = asRecord(value);
  if (!customer || "error" in customer) return safeErrorOrNull(value);
  return {
    id: safeString(customer.id),
    name: maybeRedactCustomerName(customer.name),
    phone: maybeRedactPhone(customer.phone),
    phone2: maybeRedactPhone(customer.phone2),
    wilaya: safeString(customer.wilaya),
    commune: safeString(customer.commune),
  };
}

function serializeLegacyCustomerNotes(value: unknown): unknown {
  const result = asRecord(value);
  if (!result || "error" in result) return safeErrorOrNull(value);
  return {
    customerId: safeString(result.customerId),
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
        itemCount: safeNumber(summary.itemCount),
        totalQuantity: safeNumber(summary.totalQuantity),
        wilaya: safeString(summary.wilaya),
      };
    case "create_customer":
      return {
        customerName: maybeRedactCustomerName(summary.customerName),
        phoneLast4:
          typeof summary.phoneLast4 === "string"
            ? `••${summary.phoneLast4.slice(-2)}`
            : null,
        wilaya: safeString(summary.wilaya),
      };
    case "update_customer_notes":
      return {
        customerName: maybeRedactCustomerName(summary.customerName),
        mode: safeString(summary.mode),
        noteLength: safeNumber(summary.noteLength),
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
      tool: toolName,
    };
  }

  const summary = asRecord(proposal.summary);
  return {
    pending_action_proposal: true,
    tool: toolName,
    proposal: {
      id: safeString(proposal.id),
      toolName,
      status: safeString(proposal.status),
      proposalDigestPrefix: safeDigestPrefix(proposal.proposalDigestPrefix),
      summary:
        summary && CUSTOMER_PROPOSAL_TOOLS.has(toolName)
          ? serializeProposalSummary(toolName, summary)
          : summary
            ? (redactToolResult(summary) as JsonRecord)
            : null,
      expiresAt: safeTimestamp(proposal.expiresAt),
      createdAt: safeTimestamp(proposal.createdAt),
      executionState: safeString(proposal.executionState),
      lastErrorCode: safeString(proposal.lastErrorCode),
    },
  };
}

/**
 * Serialize one tool result for the remote model.
 *
 * Every current tool must be explicitly classified as either tool-aware PII
 * projection or reviewed generic-safe output. Unknown/future tools fail closed
 * until they are reviewed and classified. Known customer/contact tools get
 * explicit allowlisted projections and every projected field is type-checked
 * before it crosses the remote boundary. Free-form customer message content and
 * the full trusted proposal digest never cross this serializer.
 */
export function serializeToolResultForRemoteModel(
  toolName: string,
  result: unknown,
): unknown {
  if (!isKnownRemoteTool(toolName)) return null;

  const record = asRecord(result);
  if (record && "error" in record) {
    return { error: "Tool failed" };
  }
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
      return REVIEWED_GENERIC_REMOTE_TOOL_SET.has(toolName)
        ? redactToolResult(result)
        : null;
  }
}
