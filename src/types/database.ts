/**
 * SahelFlow Shared TypeScript Interfaces
 * Central type definitions for all database tables
 */

// ===== PRODUCT VARIANTS =====
export interface ProductVariant {
  id: string;
  name: string; // e.g. "Size", "Color"
  options: string[]; // e.g. ["S", "M", "L", "XL"]
}

// ===== CATEGORIES =====
export interface Category {
  id: string;
  seller_id: string;
  name: string;
  slug: string;
  sort_order: number;
  created_at: string;
}

// ===== SELLERS =====
export interface Seller {
  id: string;
  email: string;
  full_name: string | null;
  business_name: string | null;
  phone: string | null;
  plan: "free" | "starter" | "pro" | "enterprise";
  settings: Record<string, unknown>;
  shipping_rates: Record<
    number,
    { home: number; desk: number; express: boolean }
  >;
  webhook_token: string | null;
  webhook_orders_count: number;
  webhook_last_sync: string | null;
  whatsapp_template: string | null;
  notification_settings: NotificationSettings | null;
  wilaya: string | null;
  categories: string[] | null;
  delivery_partners: string[] | null;
  order_sources: string[] | null;
  onboarding_completed: boolean;
  slug: string | null;
  form_enabled: boolean;
  form_config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface NotificationSettings {
  newOrders: boolean;
  confirmations: boolean;
  highRisk: boolean;
  lowStock: boolean;
  delivery: boolean;
  weekly: boolean;
}

// ===== PRODUCTS =====
export interface Product {
  id: string;
  seller_id: string;
  name: string;
  sku: string | null;
  description: string | null;
  variants: ProductVariant[];
  category_id: string | null;
  stock: number;
  price: number;
  cost_price: number;
  image_url: string | null;
  active: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

// ===== CUSTOMERS =====
export interface Customer {
  id: string;
  seller_id: string;
  name: string | null;
  phone: string | null;
  wilaya: string | null;
  commune: string | null;
  address: string | null;
  order_count: number;
  total_spent: number;
  risk_score: number;
  is_blocked: boolean;
  metadata: Record<string, unknown>;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

// ===== ORDERS =====
export type OrderStatus =
  | "draft"
  | "pending"
  | "confirmed"
  | "shipped"
  | "delivered"
  | "returned"
  | "refused"
  | "cancelled";

export type OrderSource =
  | "draft"
  | "manual"
  | "shopify"
  | "woocommerce"
  | "youcan"
  | "custom"
  | "ai"
  | "messenger";

export type ConfirmationStatus =
  | "rappel"
  | "en_attente"
  | "doublon"
  | "faux_numero"
  | "boite_vocale"
  | "confirmed"
  | "annule";

export type ReturnReason =
  | "wrong_product"
  | "damaged"
  | "changed_mind"
  | "not_as_described"
  | "wrong_size"
  | "other";

export interface OrderItem {
  product_name: string;
  quantity: number;
  unit_price: number;
  product_id?: string;
  variant?: string | null;
}

export interface Order {
  id: string;
  seller_id: string;
  customer_id: string | null;
  order_number: string;
  status: OrderStatus;
  source: OrderSource;
  external_id: string | null;
  items: OrderItem[];
  total_price: number;
  delivery_cost: number;
  net_profit: number;
  wilaya: string | null;
  commune: string | null;
  address: string | null;
  tracking_id: string | null;
  delivery_company: string | null;
  delivery_type: "home" | "desk";
  risk_score: number;
  notes: string | null;
  confirmed_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  confirmation_status: ConfirmationStatus | null;
  confirmation_attempts: number;
  confirmation_notes: string | null;
  return_reason: ReturnReason | null;
  upsell_offered: boolean;
  upsell_accepted: boolean;
  conversation_id: string | null;
  form_metadata: Record<string, unknown> | null;
  customer?: Customer | null;
}

// ===== DELIVERIES =====
export type DeliveryProvider = "yalidine" | "maystro" | "zrexpress" | "manual";
export type DeliveryStatus =
  | "pending"
  | "created"
  | "picked_up"
  | "in_transit"
  | "at_hub"
  | "out_for_delivery"
  | "delivered"
  | "returned"
  | "refused"
  | "failed";

export interface Delivery {
  id: string;
  order_id: string;
  seller_id: string;
  provider: DeliveryProvider;
  tracking_number: string | null;
  status: DeliveryStatus;
  raw_response: Record<string, unknown>;
  last_sync: string;
  created_at: string;
}

// ===== AUTOMATIONS =====
export interface Automation {
  id: string;
  seller_id: string;
  name: string;
  description: string | null;
  trigger_type: string;
  trigger_config: Record<string, unknown> | null;
  action_type: string;
  action_config: Record<string, unknown> | null;
  active: boolean;
  run_count: number;
  last_run_at: string | null;
  created_at: string;
}

// ===== DASHBOARD STATS =====
export interface DashboardStats {
  totalOrders: number;
  totalRevenue: number;
  totalProfit: number;
  totalProducts: number;
  totalCustomers: number;
  totalStock: number;
  deliveryRate: number;
  returnRate: number;
  byStatus: Record<string, number>;
  pendingOrders: number;
  confirmedOrders: number;
  codInTransit: number;
  codCleared: number;
  codPendingCollection: number;
  codAtRisk: number;
}

// ===== COD CASH FLOW STATS =====
export interface CODStats {
  moneyInTransit: number;
  packagesAtDepot: number;
  returnsThisMonth: number;
  collectedThisMonth: number;
}

// ===== INTEGRATIONS =====
export interface Integration {
  id: string;
  seller_id: string;
  platform: string;
  credentials: Record<string, unknown>;
  is_active: boolean;
  last_sync: string | null;
  created_at: string;
}

// ===== WHATSAPP TEMPLATES =====
export type TemplateCategory =
  | "welcome"
  | "followup"
  | "confirmation"
  | "upsell"
  | "general";
export type TemplateLanguage = "ar" | "fr" | "en";

export interface WhatsAppTemplate {
  id: string;
  seller_id: string;
  name: string;
  slug: string;
  content: string;
  category: TemplateCategory;
  language: TemplateLanguage;
  active: boolean;
  created_at: string;
  updated_at: string;
}

// ===== WEBHOOK EVENTS =====
export interface WebhookEvent {
  id: string;
  seller_id: string;
  platform: string;
  event_id: string;
  topic: string | null;
  received_at: string;
}

// ===== IMPORT BATCHES =====
export type ImportBatchStatus =
  | "pending"
  | "preview"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

export interface ImportBatch {
  id: string;
  seller_id: string;
  source: string;
  filename: string | null;
  row_count: number;
  processed_count: number;
  created_count: number;
  skipped_count: number;
  error_count: number;
  column_mapping: Record<string, unknown>;
  validation_errors: Array<Record<string, unknown>>;
  status: ImportBatchStatus;
  committed_at: string | null;
  created_at: string;
}

// ===== AI EXTRACTION =====
export interface AIExtraction {
  customer_name: string | undefined;
  phone: string | undefined;
  wilaya: string | undefined;
  commune: string | undefined;
  address: string | undefined;
  products: Array<{
    product_id?: string;
    name: string;
    quantity: number;
    price?: number;
    variant?: string | null;
  }>;
  confidence: number;
  raw_text: string;
}
