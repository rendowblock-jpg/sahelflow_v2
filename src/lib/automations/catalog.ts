import { ALLOWED_TRANSITIONS } from "@/lib/order-transitions";
import type { OrderStatus } from "@/types/domain";

export type SellerAutomationTrigger =
  | "order.created"
  | "order.confirmed"
  | "order.shipped"
  | "order.delivered"
  | "order.returned"
  | "order.refused"
  | "order.cancelled"
  | "customer.blacklisted"
  | "message.received"
  | "stock.low";

export type SellerAutomationAction =
  | "send_whatsapp"
  | "update_status"
  | "tag_customer"
  | "send_notification"
  | "wait"
  | "recheck_order_status";

export type SellerOrderStatusTarget =
  | "shipped"
  | "delivered"
  | "returned"
  | "refused"
  | "cancelled";

export type SellerOrderCheckStatus = OrderStatus;

export type SellerConditionOperator =
  | "equal"
  | "not_equal"
  | "contains"
  | "not_contains"
  | "starts_with"
  | "ends_with"
  | "greater_than"
  | "less_than"
  | "greater_than_or_equal"
  | "less_than_or_equal"
  | "in"
  | "not_in"
  | "is_empty"
  | "is_not_empty";

export type SellerConditionField = {
  value: string;
  copyKey:
    | "condition.wilaya"
    | "condition.totalPrice"
    | "condition.customerName"
    | "condition.customerPhone"
    | "condition.orderNumber"
    | "condition.productName"
    | "condition.stockLevel"
    | "condition.lowStockThreshold"
    | "condition.messageText";
  type: "text" | "number" | "phone";
  operators: readonly SellerConditionOperator[];
};

export type SellerTriggerSpec = {
  value: SellerAutomationTrigger;
  labelKey: string;
  group: "orders" | "customers" | "messages" | "inventory";
  fields: readonly SellerConditionField[];
  variables: readonly string[];
  actions: readonly SellerAutomationAction[];
  sellerReady: boolean;
};

const TEXT_OPERATORS = [
  "equal",
  "not_equal",
  "contains",
  "not_contains",
  "starts_with",
  "ends_with",
  "in",
  "not_in",
  "is_empty",
  "is_not_empty",
] as const satisfies readonly SellerConditionOperator[];

const NUMBER_OPERATORS = [
  "equal",
  "not_equal",
  "greater_than",
  "less_than",
  "greater_than_or_equal",
  "less_than_or_equal",
  "in",
  "not_in",
  "is_empty",
  "is_not_empty",
] as const satisfies readonly SellerConditionOperator[];

const field = {
  wilaya: {
    value: "wilaya",
    copyKey: "condition.wilaya",
    type: "text",
    operators: TEXT_OPERATORS,
  },
  totalPrice: {
    value: "totalPrice",
    copyKey: "condition.totalPrice",
    type: "number",
    operators: NUMBER_OPERATORS,
  },
  customerName: {
    value: "customerName",
    copyKey: "condition.customerName",
    type: "text",
    operators: TEXT_OPERATORS,
  },
  customerPhone: {
    value: "customerPhone",
    copyKey: "condition.customerPhone",
    type: "phone",
    operators: TEXT_OPERATORS,
  },
  orderNumber: {
    value: "orderNumber",
    copyKey: "condition.orderNumber",
    type: "text",
    operators: TEXT_OPERATORS,
  },
  productName: {
    value: "productName",
    copyKey: "condition.productName",
    type: "text",
    operators: TEXT_OPERATORS,
  },
  stockLevel: {
    value: "stockLevel",
    copyKey: "condition.stockLevel",
    type: "number",
    operators: NUMBER_OPERATORS,
  },
  lowStockThreshold: {
    value: "lowStockThreshold",
    copyKey: "condition.lowStockThreshold",
    type: "number",
    operators: NUMBER_OPERATORS,
  },
  messageText: {
    value: "messageText",
    copyKey: "condition.messageText",
    type: "text",
    operators: TEXT_OPERATORS,
  },
} as const satisfies Record<string, SellerConditionField>;

// `order.created` is emitted from the canonical create path and includes the
// customer name. Status-transition events are emitted from the committed order
// transition and intentionally carry IDs, phone, total and wilaya, but not the
// customer name. Keep seller-visible fields/tokens aligned with those exact
// payloads so the builder cannot offer a condition that never matches or a
// template token that would render blank.
const ORDER_CREATED_FIELDS = [
  field.wilaya,
  field.totalPrice,
  field.customerName,
  field.customerPhone,
  field.orderNumber,
] as const;

const ORDER_CREATED_VARIABLES = [
  "customerName",
  "customerPhone",
  "orderNumber",
  "totalPrice",
  "wilaya",
] as const;

const ORDER_STATUS_FIELDS = [
  field.wilaya,
  field.totalPrice,
  field.customerPhone,
  field.orderNumber,
] as const;

const ORDER_STATUS_VARIABLES = [
  "customerPhone",
  "orderNumber",
  "totalPrice",
  "wilaya",
] as const;

const ORDER_EFFECT_ACTIONS = [
  "send_whatsapp",
  "tag_customer",
  "send_notification",
  "wait",
  "recheck_order_status",
] as const satisfies readonly SellerAutomationAction[];

const ORDER_TRANSITION_ACTIONS = [
  "send_whatsapp",
  "update_status",
  "tag_customer",
  "send_notification",
  "wait",
  "recheck_order_status",
] as const satisfies readonly SellerAutomationAction[];

const SELLER_ORDER_STATUS_TARGETS = [
  "shipped",
  "delivered",
  "returned",
  "refused",
  "cancelled",
] as const satisfies readonly SellerOrderStatusTarget[];

export const SELLER_ORDER_CHECK_STATUSES = [
  "draft",
  "pending",
  "confirmed",
  "shipped",
  "delivered",
  "returned",
  "refused",
  "cancelled",
] as const satisfies readonly SellerOrderCheckStatus[];

const TRIGGER_ORDER_STATUS: Partial<Record<SellerAutomationTrigger, OrderStatus>> = {
  "order.confirmed": "confirmed",
  "order.shipped": "shipped",
  "order.delivered": "delivered",
  "order.returned": "returned",
  "order.refused": "refused",
  "order.cancelled": "cancelled",
};

// Runtime rendering accepts only this exact grammar. Validation removes every
// exact token and treats any remaining brace as malformed template syntax. This
// rejects spaced, nested, extra-brace and unclosed placeholders before a
// customer-facing message can be saved.
const TEMPLATE_TOKEN_PATTERN = /\{\{([A-Za-z0-9_.-]+)\}\}/g;

export const SELLER_AUTOMATION_TRIGGERS = [
  {
    value: "order.created",
    labelKey: "automations.triggers.orderCreated",
    group: "orders",
    fields: ORDER_CREATED_FIELDS,
    variables: ORDER_CREATED_VARIABLES,
    // Creation events can represent draft or pending orders. Direct status
    // mutation remains unavailable here, but a live re-check can safely inspect
    // the committed order after a durable wait.
    actions: ORDER_EFFECT_ACTIONS,
    sellerReady: true,
  },
  {
    value: "order.confirmed",
    labelKey: "automations.triggers.orderConfirmed",
    group: "orders",
    fields: ORDER_STATUS_FIELDS,
    variables: ORDER_STATUS_VARIABLES,
    actions: ORDER_TRANSITION_ACTIONS,
    sellerReady: true,
  },
  {
    value: "order.shipped",
    labelKey: "automations.triggers.orderShipped",
    group: "orders",
    fields: ORDER_STATUS_FIELDS,
    variables: ORDER_STATUS_VARIABLES,
    actions: ORDER_TRANSITION_ACTIONS,
    sellerReady: true,
  },
  {
    value: "order.delivered",
    labelKey: "automations.triggers.orderDelivered",
    group: "orders",
    fields: ORDER_STATUS_FIELDS,
    variables: ORDER_STATUS_VARIABLES,
    actions: ORDER_TRANSITION_ACTIONS,
    sellerReady: true,
  },
  {
    value: "order.returned",
    labelKey: "automations.triggers.orderReturned",
    group: "orders",
    fields: ORDER_STATUS_FIELDS,
    variables: ORDER_STATUS_VARIABLES,
    actions: ORDER_EFFECT_ACTIONS,
    sellerReady: true,
  },
  {
    value: "order.refused",
    labelKey: "automations.triggers.orderRefused",
    group: "orders",
    fields: ORDER_STATUS_FIELDS,
    variables: ORDER_STATUS_VARIABLES,
    actions: ORDER_EFFECT_ACTIONS,
    sellerReady: true,
  },
  {
    value: "order.cancelled",
    labelKey: "automations.triggers.orderCancelled",
    group: "orders",
    fields: ORDER_STATUS_FIELDS,
    variables: ORDER_STATUS_VARIABLES,
    actions: ORDER_EFFECT_ACTIONS,
    sellerReady: true,
  },
  {
    value: "customer.blacklisted",
    labelKey: "automations.triggers.customerBlacklisted",
    group: "customers",
    fields: [field.customerName, field.customerPhone],
    variables: ["customerName", "customerPhone"],
    actions: ["send_whatsapp", "tag_customer", "send_notification", "wait"],
    sellerReady: true,
  },
  {
    value: "message.received",
    labelKey: "automations.triggers.messageReceived",
    group: "messages",
    fields: [field.customerName, field.customerPhone, field.messageText],
    variables: ["customerName", "customerPhone", "messageText"],
    // Inbound group/unsupported senders can carry `customerPhone:null`; the
    // visible in-app notification is destination-free and therefore truthful.
    actions: ["send_notification", "wait"],
    sellerReady: true,
  },
  {
    value: "stock.low",
    labelKey: "automations.triggers.stockLow",
    group: "inventory",
    fields: [field.productName, field.stockLevel, field.lowStockThreshold],
    variables: ["productName", "stockLevel", "lowStockThreshold"],
    actions: ["send_notification", "wait"],
    sellerReady: true,
  },
] as const satisfies readonly SellerTriggerSpec[];

export const SELLER_AUTOMATION_ACTIONS = [
  {
    value: "send_whatsapp",
    copyKey: "action.sendWhatsapp",
    requires: "customerPhone",
    legacyOnly: false,
  },
  {
    value: "update_status",
    copyKey: "action.updateStatus",
    requires: "orderId",
    legacyOnly: false,
  },
  {
    value: "tag_customer",
    copyKey: "action.addCustomerNote",
    requires: "customerId",
    legacyOnly: false,
  },
  {
    value: "send_notification",
    copyKey: "action.sendNotification",
    requires: null,
    legacyOnly: false,
  },
  {
    value: "wait",
    copyKey: "action.wait",
    requires: null,
    legacyOnly: false,
  },
  {
    value: "recheck_order_status",
    copyKey: "action.recheckOrderStatus",
    requires: "orderId",
    legacyOnly: false,
  },
] as const;

export function getSellerTriggerSpec(
  trigger: string,
): SellerTriggerSpec | undefined {
  return SELLER_AUTOMATION_TRIGGERS.find((item) => item.value === trigger);
}

export function getSellerActionSpec(action: string) {
  return SELLER_AUTOMATION_ACTIONS.find((item) => item.value === action);
}

export function sellerReadyTriggers(): readonly SellerTriggerSpec[] {
  return SELLER_AUTOMATION_TRIGGERS.filter((item) => item.sellerReady);
}

export function actionAllowedForTrigger(
  trigger: string,
  action: string,
): boolean {
  const spec = getSellerTriggerSpec(trigger);
  return Boolean(spec?.actions.includes(action as SellerAutomationAction));
}

/** Return seller-supported governed targets reachable from one committed status. */
export function getSellerStatusTargetsFromStatus(
  currentStatus: SellerOrderCheckStatus,
): readonly SellerOrderStatusTarget[] {
  const allowed = ALLOWED_TRANSITIONS[currentStatus] as readonly string[];
  return SELLER_ORDER_STATUS_TARGETS.filter((status) => allowed.includes(status));
}

/**
 * Return only order-status targets that the canonical order state machine can
 * actually reach from the selected status-event trigger.
 */
export function getSellerStatusTargets(
  trigger: string,
): readonly SellerOrderStatusTarget[] {
  const currentStatus = TRIGGER_ORDER_STATUS[trigger as SellerAutomationTrigger];
  return currentStatus ? getSellerStatusTargetsFromStatus(currentStatus) : [];
}

/** A live re-check reads the committed order, so every canonical status is valid. */
export function getSellerRecheckStatuses(
  trigger: string,
): readonly SellerOrderCheckStatus[] {
  return trigger.startsWith("order.") ? SELLER_ORDER_CHECK_STATUSES : [];
}

/**
 * Return unique unsupported template variables for the selected trigger. The
 * special `…` marker means brace syntax is malformed and would not be rendered
 * by the runtime. The builder and trusted write policy share this function so
 * they cannot disagree on what is safe to save.
 */
export function unsupportedTemplateVariablesForTrigger(
  trigger: string,
  template: string,
): string[] {
  const spec = getSellerTriggerSpec(trigger);
  if (!spec) return [];
  const allowed = new Set(spec.variables);
  const unsupported = new Set<string>();
  const scrubbed = template.replace(
    TEMPLATE_TOKEN_PATTERN,
    (_match, token: string) => {
      if (!allowed.has(token)) unsupported.add(token);
      return "";
    },
  );
  if (/[{}]/.test(scrubbed)) unsupported.add("…");
  return [...unsupported];
}

export function normalizeConditionValueForSubmit(
  raw: string,
  operator: SellerConditionOperator,
  type: SellerConditionField["type"],
): string | number | string[] | number[] | null {
  if (operator === "is_empty" || operator === "is_not_empty") return null;
  if (operator === "in" || operator === "not_in") {
    const values = raw
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    if (type === "number") {
      return values
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value));
    }
    return values;
  }
  if (type === "number") {
    const value = Number(raw);
    return Number.isFinite(value) ? value : raw;
  }
  return raw;
}

export function conditionValueForEditor(value: unknown): string {
  if (Array.isArray(value)) return value.join(", ");
  if (value === null || value === undefined) return "";
  return String(value);
}
