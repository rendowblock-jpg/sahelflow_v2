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
  | "send_notification";

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

const ORDER_FIELDS = [
  field.wilaya,
  field.totalPrice,
  field.customerName,
  field.customerPhone,
  field.orderNumber,
] as const;

const ORDER_VARIABLES = [
  "customerName",
  "customerPhone",
  "orderNumber",
  "totalPrice",
  "wilaya",
] as const;

const ORDER_ACTIONS = [
  "send_whatsapp",
  "update_status",
  "tag_customer",
] as const satisfies readonly SellerAutomationAction[];

export const SELLER_AUTOMATION_TRIGGERS = [
  {
    value: "order.created",
    labelKey: "automations.triggers.orderCreated",
    group: "orders",
    fields: ORDER_FIELDS,
    variables: ORDER_VARIABLES,
    actions: ORDER_ACTIONS,
    sellerReady: true,
  },
  {
    value: "order.confirmed",
    labelKey: "automations.triggers.orderConfirmed",
    group: "orders",
    fields: ORDER_FIELDS,
    variables: ORDER_VARIABLES,
    actions: ORDER_ACTIONS,
    sellerReady: true,
  },
  {
    value: "order.shipped",
    labelKey: "automations.triggers.orderShipped",
    group: "orders",
    fields: ORDER_FIELDS,
    variables: ORDER_VARIABLES,
    actions: ORDER_ACTIONS,
    sellerReady: true,
  },
  {
    value: "order.delivered",
    labelKey: "automations.triggers.orderDelivered",
    group: "orders",
    fields: ORDER_FIELDS,
    variables: ORDER_VARIABLES,
    actions: ORDER_ACTIONS,
    sellerReady: true,
  },
  {
    value: "order.returned",
    labelKey: "automations.triggers.orderReturned",
    group: "orders",
    fields: ORDER_FIELDS,
    variables: ORDER_VARIABLES,
    actions: ORDER_ACTIONS,
    sellerReady: true,
  },
  {
    value: "order.refused",
    labelKey: "automations.triggers.orderRefused",
    group: "orders",
    fields: ORDER_FIELDS,
    variables: ORDER_VARIABLES,
    actions: ORDER_ACTIONS,
    sellerReady: true,
  },
  {
    value: "order.cancelled",
    labelKey: "automations.triggers.orderCancelled",
    group: "orders",
    fields: ORDER_FIELDS,
    variables: ORDER_VARIABLES,
    actions: ORDER_ACTIONS,
    sellerReady: true,
  },
  {
    value: "customer.blacklisted",
    labelKey: "automations.triggers.customerBlacklisted",
    group: "customers",
    fields: [field.customerName, field.customerPhone],
    variables: ["customerName", "customerPhone"],
    actions: ["send_whatsapp", "tag_customer"],
    sellerReady: true,
  },
  {
    value: "message.received",
    labelKey: "automations.triggers.messageReceived",
    group: "messages",
    fields: [field.customerName, field.customerPhone, field.messageText],
    variables: ["customerName", "customerPhone", "messageText"],
    actions: ["send_whatsapp"],
    sellerReady: true,
  },
  {
    value: "stock.low",
    labelKey: "automations.triggers.stockLow",
    group: "inventory",
    fields: [field.productName, field.stockLevel, field.lowStockThreshold],
    variables: ["productName", "stockLevel", "lowStockThreshold"],
    // The durable engine still understands the historical `send_notification`
    // action, but it does not currently create one visible seller notification
    // surface. Keep the trigger readable for old definitions without offering a
    // new flow that would over-promise a user-visible effect.
    actions: [],
    sellerReady: false,
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
    copyKey: "action.legacyNotification",
    requires: null,
    legacyOnly: true,
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

export function normalizeConditionValueForSubmit(
  raw: string,
  operator: SellerConditionOperator,
  type: SellerConditionField["type"],
): string | number | string[] | null {
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
