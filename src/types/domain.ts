/**
 * Domain types — clean, Prisma-independent types for the business domain.
 *
 * These are the "shape" types used across the app (UI, services, validation).
 * They map to Prisma models but don't depend on @prisma/client, so they're
 * safe to import from anywhere (client or server).
 *
 * Money is always integer DZD. IDs are cuid strings.
 */

// ─── Order ────────────────────────────────────────────────────────────────────

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
  | "whatsapp"
  | "tiktok"
  | "manual"
  | "storefront"
  | "ai_chat"
  | "shopify"
  | "woocommerce"
  | "youcan"
  | "csv"
  | "xlsx";

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string | null;
  productVariantId: string | null;
  productName: string;
  productVariantName: string | null;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface Order {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  version: number;
  customerId: string;
  items: OrderItem[];
  totalPrice: number;
  deliveryCost: number | null;
  wilaya: string;
  commune: string;
  address: string;
  phone: string;
  source: OrderSource;
  sourceOrderId: string | null;
  sourceMetadata: OrderSourceMetadata | null;
  notes: string | null;
  confirmedAt: Date | null;
  packedAt: Date | null;
  shippedAt: Date | null;
  deliveredAt: Date | null;
  fulfillmentState: import("@/lib/business-truth/contracts").FulfillmentState | null;
  deliveryState: import("@/lib/business-truth/contracts").CanonicalDeliveryState | null;
  inventoryState: import("@/lib/business-truth/contracts").OrderInventoryState | null;
  codState: import("@/lib/business-truth/contracts").CodFinancialState | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderSourceMetadata {
  authority?: string;
  source?: OrderSource;
  sourceIdentity?: string;
  sourceOrderId?: string;
  conversationId?: string;
  messageId?: string;
  platform?: string;
}

// ─── Customer ─────────────────────────────────────────────────────────────────

export interface Customer {
  id: string;
  name: string;
  phone: string;
  phone2: string | null;
  wilaya: string | null;
  commune: string | null;
  address: string | null;
  orderCount: number;
  totalSpent: number;
  riskScore: number;
  isBlacklisted: boolean;
  blacklistReason: string | null;
  blacklistedAt: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Product ──────────────────────────────────────────────────────────────────

export interface ProductVariant {
  id: string;
  productId: string;
  name: string;
  sku: string | null;
  price: number | null;
  stock: number;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Product {
  id: string;
  name: string;
  sku: string | null;
  price: number;
  cost: number | null;
  stock: number;
  lowStockThreshold: number;
  categoryId: string | null;
  variants: ProductVariant[] | null;
  images: string[] | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Category {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Delivery ─────────────────────────────────────────────────────────────────

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

export type DeliveryProvider =
  | "manual"
  | "yalidine"
  | "maystro"
  | "zrexpress"
  | "dhd";

export interface Delivery {
  id: string;
  orderId: string;
  provider: DeliveryProvider;
  trackingNumber: string | null;
  labelUrl: string | null;
  cost: number | null;
  status: DeliveryStatus;
  estimatedDelivery: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Conversation / Message (for the inbox) ───────────────────────────────────

export type MessageChannel = "whatsapp" | "tiktok";
export type MessageDirection = "inbound" | "outbound";
export type ExtractionMethod = "regex" | "gemini" | "none" | null;

export interface Conversation {
  id: string;
  channel: MessageChannel;
  contactName: string;
  contactPhone: string | null;
  sourceId: string | null;
  lastMessageAt: Date | null;
  unreadCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Message {
  id: string;
  conversationId: string;
  body: string;
  direction: MessageDirection;
  timestamp: Date;
  extractedOrderJson: string | null;
  extractionMethod: ExtractionMethod;
  createdAt: Date;
}

// ─── Dashboard stats ──────────────────────────────────────────────────────────

export interface DashboardStats {
  ordersToday: number;
  ordersTrend: number;
  revenueToday: number;
  revenueTrend: number;
  realizedRevenueToday: number;
  realizedRevenueTrend: number;
  newCustomers: number;
  activeConversations: number;
  pendingDeliveries: number;
  lowStockProducts: number;
}
