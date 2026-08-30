import type { OrderStatus } from "@/types/domain";

export type MutationAuthority =
  | "canonical_v1"
  | "confirmation_blocked"
  | "legacy_compatibility";

export interface WorkbenchFieldAccess {
  contact: boolean;
  financials: boolean;
  risk: boolean;
  update: boolean;
  delete: boolean;
}

export interface OrderListItem {
  id: string;
  orderNumber: string;
  status: OrderStatus | string;
  totalPrice: number | null;
  wilaya: string | null;
  phone: string | null;
  createdAt: Date | string;
  items: Array<{ id: string }>;
  customer: { name: string | null; phone: string | null } | null;
  mutationAuthority: MutationAuthority;
}

export interface RiskListProjection {
  level: string;
  score: number;
}

/**
 * Server-applied list filters echoed back to the client so URL state and server
 * truth stay comparable (a stale RSC fallback is only reused when the URL
 * filters still match what the server actually applied).
 */
export interface OrdersWorkbenchAppliedFilters {
  q?: string | null;
  wilaya?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  minTotal?: number | null;
  maxTotal?: number | null;
}

export interface OrdersWorkbenchResponse {
  orders: OrderListItem[];
  riskData?: Record<string, RiskListProjection>;
  fieldAccess: WorkbenchFieldAccess;
  appliedFilters?: OrdersWorkbenchAppliedFilters;
  total: number;
  hasNextPage: boolean;
  page: number;
  pageSize: number;
  sort: string;
}

export interface ConfirmationQueueItem {
  id: string;
  orderNumber: string;
  version: number;
  ageMinutes: number;
  isStale: boolean;
  ageLabel: string;
  mutationAuthority: MutationAuthority;
  canUpdate: boolean;
  customerName: string | null;
  phone: string | null;
  wilaya: string | null;
  totalPrice: number | null;
}

export interface ConfirmationQueueResponse {
  queue: ConfirmationQueueItem[];
  fieldAccess: Pick<WorkbenchFieldAccess, "contact" | "financials">;
  total: number;
  staleCount: number;
  totalValue: number | null;
  hasNextPage: boolean;
  page: number;
  pageSize: number;
}

export interface CustomerWorkbenchFieldAccess {
  contact: boolean;
  financials: boolean;
  risk: boolean;
  manage: boolean;
  contactUpdate: boolean;
  import: boolean;
  export: boolean;
}

export interface CustomerWorkbenchItem {
  id: string;
  name: string | null;
  phone: string | null;
  wilaya: string | null;
  commune: string | null;
  orderCount: number;
  totalSpent: number | null;
  riskScore: number | null;
  isBlacklisted: boolean | null;
  createdAt: Date | string;
}

export interface CustomersWorkbenchResponse {
  customers: CustomerWorkbenchItem[];
  fieldAccess: CustomerWorkbenchFieldAccess;
  /** Echo of the free-text search actually applied server-side. */
  appliedFilters?: { q?: string | null };
  total: number;
  hasNextPage: boolean;
  page: number;
  pageSize: number;
}

export interface ProductWorkbenchFieldAccess {
  cost: boolean;
  manage: boolean;
  costUpdate: boolean;
  import: boolean;
  export: boolean;
}

export interface ProductWorkbenchVariant {
  id: string;
  name: string;
  sku: string | null;
  price: number | null;
  stock: number;
  isActive: boolean;
  sortOrder: number;
}

export interface ProductWorkbenchItem {
  id: string;
  name: string;
  sku: string | null;
  price: number;
  cost: number | null;
  stock: number;
  lowStockThreshold: number;
  categoryId: string | null;
  images: string[] | null;
  productVariants: ProductWorkbenchVariant[];
  isActive: boolean;
  createdAt: Date | string;
}

export interface ProductsWorkbenchResponse {
  products: ProductWorkbenchItem[];
  fieldAccess: ProductWorkbenchFieldAccess;
  /** Echo of the free-text search actually applied server-side. */
  appliedFilters?: { q?: string | null };
  total: number;
  hasNextPage: boolean;
  page: number;
  pageSize: number;
}
