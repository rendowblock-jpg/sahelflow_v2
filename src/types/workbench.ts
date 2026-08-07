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

export interface OrdersWorkbenchResponse {
  orders: OrderListItem[];
  riskData?: Record<string, RiskListProjection>;
  fieldAccess: WorkbenchFieldAccess;
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

export interface CustomerWorkbenchAccess {
  contact: boolean;
  financials: boolean;
  risk: boolean;
  manage: boolean;
  contactUpdate: boolean;
  export: boolean;
  import: boolean;
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
  fieldAccess: CustomerWorkbenchAccess;
  total: number;
  hasNextPage: boolean;
  page: number;
  pageSize: number;
}

export interface CustomerWorkbenchSummary {
  totalCustomers: number;
  activeCustomers: number;
  totalSpent: number | null;
  atRiskCustomers: number | null;
}

export interface CustomerWorkbenchDetail {
  customer: CustomerWorkbenchItem & {
    phone2: string | null;
    address: string | null;
    notes: string | null;
    blacklistReason: string | null;
  };
  stats: null | {
    totalOrders: number;
    totalSpent: number | null;
    deliveredCount: number;
    returnedCount: number;
    deliveryRate: number;
    avgOrderValue: number | null;
    firstOrderDate: Date | string | null;
    lastOrderDate: Date | string | null;
  };
  orders: Array<{
    id: string;
    orderNumber: string;
    status: string;
    totalPrice: number | null;
    createdAt: Date | string;
  }>;
  fieldAccess: CustomerWorkbenchAccess & {
    orders: boolean;
    orderFinancials: boolean;
    riskManage: boolean;
  };
}

export interface ProductWorkbenchAccess {
  cost: boolean;
  manage: boolean;
  costUpdate: boolean;
  export: boolean;
  import: boolean;
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
  categoryName: string | null;
  isActive: boolean;
  createdAt: Date | string;
}

export interface ProductsWorkbenchResponse {
  products: ProductWorkbenchItem[];
  fieldAccess: ProductWorkbenchAccess;
  total: number;
  hasNextPage: boolean;
  page: number;
  pageSize: number;
  sort: string;
}

export interface ProductWorkbenchSummary {
  totalProducts: number;
  activeProducts: number;
  lowStockProducts: number;
  inventoryValue: number;
}

export interface ProductWorkbenchDetail {
  product: ProductWorkbenchItem & {
    productVariants: Array<{
      id: string;
      name: string;
      sku: string | null;
      price: number | null;
      stock: number;
      isActive: boolean;
    }>;
  };
  recentOrders: Array<{
    id: string;
    orderId: string;
    orderNumber: string;
    status: string;
    quantity: number;
    unitPrice: number | null;
    total: number | null;
    createdAt: Date | string;
  }>;
  fieldAccess: ProductWorkbenchAccess & {
    orders: boolean;
    orderFinancials: boolean;
  };
}

export interface ExpenseWorkbenchAccess {
  update: boolean;
  export: boolean;
}

export interface ExpenseWorkbenchItem {
  id: string;
  category: string;
  amount: number;
  date: Date | string;
  notes: string | null;
}

export interface ExpensesWorkbenchResponse {
  expenses: ExpenseWorkbenchItem[];
  fieldAccess: ExpenseWorkbenchAccess;
  total: number;
  hasNextPage: boolean;
  page: number;
  pageSize: number;
}
