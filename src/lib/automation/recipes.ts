export interface Recipe {
  id: string;
  name_key: string;
  description_key: string;
  icon: string;
  category: "orders" | "customers" | "messages" | "stock";
  trigger: {
    type: string;
    config: Record<string, unknown>;
  };
  action: {
    type: string;
    config: Record<string, unknown>;
  };
  default_active: boolean;
}

export const RECIPES: Recipe[] = [
  {
    id: "auto_confirm_safe",
    name_key: "autoConfirmSafeName",
    description_key: "autoConfirmSafeDesc",
    icon: "ShieldCheck",
    category: "orders",
    trigger: { type: "order.created", config: { max_risk: 20 } },
    action: { type: "update_status", config: { new_status: "confirmed" } },
    default_active: true,
  },
  {
    id: "welcome_new_customer",
    name_key: "welcomeNewCustomerName",
    description_key: "welcomeNewCustomerDesc",
    icon: "MessageCircle",
    category: "messages",
    trigger: { type: "message.first", config: {} },
    action: { type: "send_template", config: { template: "welcome" } },
    default_active: true,
  },
  {
    id: "high_risk_alert",
    name_key: "highRiskAlertName",
    description_key: "highRiskAlertDesc",
    icon: "AlertTriangle",
    category: "orders",
    trigger: { type: "risk.threshold", config: { threshold: 70 } },
    action: { type: "flag_review", config: {} },
    default_active: true,
  },
  {
    id: "low_stock_warning",
    name_key: "lowStockWarningName",
    description_key: "lowStockWarningDesc",
    icon: "Package",
    category: "stock",
    trigger: { type: "stock.low", config: { threshold: 5 } },
    action: { type: "notify", config: { channel: "dashboard" } },
    default_active: false,
  },
  {
    id: "followup_after_delivery",
    name_key: "followupDeliveryName",
    description_key: "followupDeliveryDesc",
    icon: "Truck",
    category: "messages",
    trigger: { type: "order.delivered", config: { delay_hours: 24 } },
    action: { type: "send_template", config: { template: "followup" } },
    default_active: false,
  },
  {
    id: "auto_block_returners",
    name_key: "autoBlockReturnersName",
    description_key: "autoBlockReturnersDesc",
    icon: "Ban",
    category: "customers",
    trigger: { type: "return.threshold", config: { max_returns: 3 } },
    action: { type: "block_customer", config: {} },
    default_active: false,
  },
  {
    id: "auto_create_shipment",
    name_key: "autoCreateShipmentName",
    description_key: "autoCreateShipmentDesc",
    icon: "Truck",
    category: "orders",
    trigger: { type: "order.confirmed", config: {} },
    action: { type: "create_shipment", config: {} },
    default_active: true,
  },
];

export function getRecipesByCategory(category: string): Recipe[] {
  if (category === "all") return RECIPES;
  return RECIPES.filter((r) => r.category === category);
}
